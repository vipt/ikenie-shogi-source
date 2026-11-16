package expo.modules.meguru
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.records.Field
import java.io.File
import java.security.MessageDigest

class SearchLimits : Record {
  @Field var moveLimit:Int = 0
  @Field var maxDepth:Int = 0
}

class MeguruEngineModule : Module() {
  companion object { init { System.loadLibrary("meguru") } }
  private external fun nativeAnalyze(position:String,eval:String,book:String,mask:Int,useBook:Boolean,ms:Int,game:String,id:Long,moveLimit:Int,maxDepth:Int):String
  private external fun nativeProgress(id:Long):String
  private external fun nativeCancel(id:Long)
  private external fun nativeInspect(position:String,eval:String,mask:Int):String
  private val prepared=mutableMapOf<String,File>()
  @Synchronized private fun model(name:String):File {
    require(name=="hao"||name=="trained")
    return prepared.getOrPut(name) {
      val context=requireNotNull(appContext.reactContext)
      val sha=if(name=="hao") "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782" else "fff2b55c373bf1d3bc2fb10d99ea4161329c3eedb566fa0dfc2c13c1450a266e"
      val dir=File(context.filesDir,"meguru-engine/"+sha);dir.mkdirs()
      val file=File(dir,"nn.bin")
      fun digest(f:File):String {
        val hash=MessageDigest.getInstance("SHA-256")
        f.inputStream().use { input -> val buffer=ByteArray(65536);while(true){val n=input.read(buffer);if(n<0)break;hash.update(buffer,0,n)} }
        return hash.digest().joinToString("") { "%02x".format(it) }
      }
      if(!file.exists()||file.length()!=64217066L||digest(file)!=sha) {
        val temp=File(dir,"nn.bin.tmp")
        context.assets.open(name+".nnue").use { input -> temp.outputStream().use { input.copyTo(it) } }
        check(digest(temp)==sha) { "Evaluation checksum mismatch" }
        check(temp.renameTo(file)) { "Cannot store evaluation" }
      }
      for(bookName in listOf("user_book1.db","king_recovery_book.db")) {
        val book=File(dir,bookName)
        context.assets.open(bookName).use { input -> book.outputStream().use { input.copyTo(it) } }
      }
      dir
    }
  }
  override fun definition()=ModuleDefinition {
    Name("MeguruEngine")
    AsyncFunction("analyze") { position:String,name:String,mask:Int,book:Boolean,ms:Int,game:String,id:Double,limits:SearchLimits ->
      val dir=model(name)
      nativeAnalyze(position,dir.absolutePath,dir.absolutePath,mask,book,ms,game,id.toLong(),limits.moveLimit,limits.maxDepth)
    }
    Function("progress") { id:Double -> nativeProgress(id.toLong()) }
    Function("cancel") { id:Double -> nativeCancel(id.toLong()) }
    AsyncFunction("inspect") { position:String,name:String,mask:Int -> nativeInspect(position,model(name).absolutePath,mask) }
  }
}

