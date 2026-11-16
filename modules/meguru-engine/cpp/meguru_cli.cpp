#include "meguru_mobile.h"
#include "mobile_platform.h"
#include "engine/thread_win32_osx.h"
#include <pthread.h>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
int main(int argc,char** argv){
    if(argc<3)return 2;
    const std::string eval=argv[1];const int mask=std::stoi(argv[2]);std::string position;int64_t request=0;std::string gameId="test";int gameNumber=0;
    while(std::getline(std::cin,position)){
        if(position=="quit")break;
        if(position=="newgame"){gameId="test-"+std::to_string(++gameNumber);std::cout<<"MOBILE_NEWGAME"<<std::endl;continue;}
        if(position=="stack"){
            size_t bytes=0;YaneuraOu::NativeThread t([&]{pthread_attr_t attr;pthread_getattr_np(pthread_self(),&attr);void* addr;pthread_attr_getstack(&attr,&addr,&bytes);pthread_attr_destroy(&attr);});t.join();
            std::cout<<"MOBILE_STACK "<<bytes<<std::endl;
        }else if(position=="live"){
            const std::string root="position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
            const auto id=++request;std::string result;
            YaneuraOu::NativeThread worker([&]{result=meguru_analyze(root.c_str(),eval.c_str(),eval.c_str(),mask,(argc>4&&std::string(argv[4])=="book")?1:0,0,"test",id);});
            for(int i=0;i<20;i++){
                std::this_thread::sleep_for(std::chrono::milliseconds(150));
                std::cout<<"MOBILE_PROGRESS "<<meguru_progress(id)<<std::endl;
                if(std::string(meguru_progress(id+1))!="{}")return 3;
            }
            const auto before=std::chrono::steady_clock::now();meguru_cancel(id);worker.join();
            std::cout<<"MOBILE_CANCEL "<<result<<" "<<std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-before).count()<<std::endl;
            std::cout<<"MOBILE_STALE "<<meguru_progress(id)<<std::endl;
        }else if(position=="search"||position.rfind("analyze ",0)==0){
            const std::string s=position=="search"?"position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1":position.substr(8);
            const int ms=argc>3?std::stoi(argv[3]):100;
            auto result=meguru_analyze_configured(s.c_str(),eval.c_str(),eval.c_str(),mask,(argc>4&&std::string(argv[4])=="book")?1:0,ms,gameId.c_str(),++request,argc>5?std::stoi(argv[5]):0,argc>6?std::stoi(argv[6]):0);
            std::cout<<"MOBILE_RESULT "<<result<<std::endl;
        }else {auto result=meguru_inspect(position.c_str(),eval.c_str(),mask);std::cout<<"MOBILE_PROBE "<<result<<std::endl;}
    }
}
