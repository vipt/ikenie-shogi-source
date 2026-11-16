import ExpoModulesCore
import Foundation
import CryptoKit

struct SearchLimits: Record {
  @Field var moveLimit: Int = 0
  @Field var maxDepth: Int = 0
}

public class MeguruEngineModule: Module {
  private let queue = DispatchQueue(label: "com.megurushogi.engine", qos: .userInitiated)
  private var prepared: [String: URL] = [:]
  private func model(_ name: String) throws -> URL {
    if let cached = prepared[name] { return cached }
    guard name == "hao" || name == "trained" else { throw NSError(domain: "Meguru", code: 1) }
    let sha = name == "hao" ? "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782" : "fff2b55c373bf1d3bc2fb10d99ea4161329c3eedb566fa0dfc2c13c1450a266e"
    guard let bundleURL = Bundle(for: MeguruEngineModule.self).url(forResource: "MeguruEngineAssets", withExtension: "bundle") ?? Bundle.main.url(forResource: "MeguruEngineAssets", withExtension: "bundle"),
          let assets = Bundle(url: bundleURL),
          let source = assets.url(forResource: name, withExtension: "nnue"),
          let book = assets.url(forResource: "user_book1", withExtension: "db"),
          let kingBook = assets.url(forResource: "king_recovery_book", withExtension: "db") else {
      throw NSError(domain: "Meguru", code: 2, userInfo: [NSLocalizedDescriptionKey: "Engine assets are missing"])
    }
    let manager = FileManager.default
    var dir = try manager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("meguru-engine").appendingPathComponent(sha)
    try manager.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try dir.setResourceValues(values)
    let output = dir.appendingPathComponent("nn.bin")
    func digest(_ file: URL) throws -> String {
      let data = try Data(contentsOf: file, options: .mappedIfSafe)
      return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
    var valid = false
    if manager.fileExists(atPath: output.path) { valid = try digest(output) == sha }
    if !valid {
      let data = try Data(contentsOf: source, options: .mappedIfSafe)
      guard SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == sha else {
        throw NSError(domain: "Meguru", code: 3, userInfo: [NSLocalizedDescriptionKey: "Evaluation checksum mismatch"])
      }
      try data.write(to: output, options: .atomic)
    }
    try Data(contentsOf: book).write(to: dir.appendingPathComponent("user_book1.db"), options: .atomic)
    try Data(contentsOf: kingBook).write(to: dir.appendingPathComponent("king_recovery_book.db"), options: .atomic)
    prepared[name] = dir
    return dir
  }
  public func definition() -> ModuleDefinition {
    Name("MeguruEngine")
    AsyncFunction("analyze") { (position: String, name: String, mask: Int, book: Bool, ms: Int, game: String, request: Double, limits: SearchLimits) -> String in
      let dir = try self.model(name).path
      return MeguruBridge.analyze(position, eval: dir, book: dir, mask: mask, useBook: book, milliseconds: ms, game: game, request: request, moveLimit: limits.moveLimit, maxDepth: limits.maxDepth)
    }.runOnQueue(queue)
    Function("progress") { (request: Double) in MeguruBridge.progress(request) }
    Function("cancel") { (request: Double) in MeguruBridge.cancel(request) }
    AsyncFunction("inspect") { (position: String, name: String, mask: Int) -> String in
      return MeguruBridge.inspect(position, eval: try self.model(name).path, mask: mask)
    }.runOnQueue(queue)
  }
}

