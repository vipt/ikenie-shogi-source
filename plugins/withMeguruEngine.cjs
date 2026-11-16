const {withGradleProperties,withProjectBuildGradle,withAppBuildGradle}=require('expo/config-plugins');
module.exports=config=>{
 config=withGradleProperties(config,c=>{
  for(const [key,value] of Object.entries({reactNativeArchitectures:'arm64-v8a,x86_64','org.gradle.workers.max':'2'})){
   c.modResults=c.modResults.filter(p=>p.type!=='property'||p.key!==key);
   c.modResults.push({type:'property',key,value});
  }return c;
 });
 config=withProjectBuildGradle(config,c=>{
  if(!c.modResults.contents.includes("ext.ndkVersion = '28.2.13676358'"))
   c.modResults.contents=c.modResults.contents.replace('apply plugin: "expo-root-project"',"ext.ndkVersion = '28.2.13676358'\napply plugin: \"expo-root-project\"");
  return c;
 });
 return withAppBuildGradle(config,c=>{
  if(!c.modResults.contents.includes('meguruTestBuild'))
   c.modResults.contents=c.modResults.contents.replace('    defaultConfig {',"    defaultConfig {\n        minSdkVersion 26\n        if (project.hasProperty('meguruTestBuild')) { applicationIdSuffix '.test' }");
  if(!c.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) c.modResults.contents=c.modResults.contents.replace('    defaultConfig {', "    defaultConfig {\n        externalNativeBuild { cmake { arguments '-DCMAKE_OBJECT_PATH_MAX=240' } }");
  c.modResults.contents=c.modResults.contents.replace('minSdkVersion rootProject.ext.minSdkVersion','minSdkVersion 26');
  return c;
 });
};

