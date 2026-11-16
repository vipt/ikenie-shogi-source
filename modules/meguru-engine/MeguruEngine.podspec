require 'json'
sources = JSON.parse(File.read(File.join(__dir__, 'source-files.json')))
Pod::Spec.new do |s|
  s.name = 'MeguruEngine'
  s.version = '1.2.23'
  s.summary = 'On-device Meguru Shogi engine'
  s.description = 'Variant-aware YaneuraOu derivative and NNUE evaluation'
  s.license = { :type => 'GPL-3.0-or-later', :file => 'COPYING' }
  s.author = 'Meguru Shogi contributors'
  s.homepage = 'https://github.com/yaneurao/YaneuraOu'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = ['ios/**/*.{h,mm,swift}', 'cpp/meguru_mobile.{h,cpp}', 'cpp/mobile_platform.h', 'cpp/engine/**/*.h'] + sources.map { |f| 'cpp/engine/' + f }
  s.public_header_files = 'ios/MeguruBridge.h'
  s.private_header_files = ['cpp/**/*.h']
  s.resource_bundles = { 'MeguruEngineAssets' => ['assets/*'] }
  s.libraries = 'c++'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) YANEURAOU_ENGINE_NNUE=1 IS_64BIT=1 NDEBUG=1 ENGINE_NAME=\"MeguruShogi-Mobile-1\" TARGET_CPU=\"MOBILE\"',
    'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -O3 -include "$(PODS_TARGET_SRCROOT)/cpp/mobile_platform.h"',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/cpp/engine" "$(PODS_TARGET_SRCROOT)/cpp"',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
