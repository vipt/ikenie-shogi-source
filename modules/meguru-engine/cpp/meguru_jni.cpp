#include <jni.h>
#include "meguru_mobile.h"
#include <string>
static std::string text(JNIEnv* env,jstring value){
    const char* raw=env->GetStringUTFChars(value,nullptr);std::string out(raw);env->ReleaseStringUTFChars(value,raw);return out;
}
extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_meguru_MeguruEngineModule_nativeAnalyze(JNIEnv* e,jobject,jstring p,jstring eval,jstring book,jint mask,jboolean useBook,jint ms,jstring game,jlong id,jint moveLimit,jint maxDepth){
    auto a=text(e,p),b=text(e,eval),c=text(e,book),d=text(e,game);
    return e->NewStringUTF(meguru_analyze_configured(a.c_str(),b.c_str(),c.c_str(),mask,useBook,ms,d.c_str(),id,moveLimit,maxDepth));
}
extern "C" JNIEXPORT void JNICALL Java_expo_modules_meguru_MeguruEngineModule_nativeCancel(JNIEnv*,jobject,jlong id){meguru_cancel(id);}
extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_meguru_MeguruEngineModule_nativeInspect(JNIEnv* e,jobject,jstring p,jstring eval,jint mask){
    auto a=text(e,p),b=text(e,eval);return e->NewStringUTF(meguru_inspect(a.c_str(),b.c_str(),mask));
}

extern "C" JNIEXPORT jstring JNICALL Java_expo_modules_meguru_MeguruEngineModule_nativeProgress(JNIEnv* e,jobject,jlong id){return e->NewStringUTF(meguru_progress(id));}
