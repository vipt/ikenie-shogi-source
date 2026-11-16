#include "meguru_mobile.h"
#include "engine/engine/yaneuraou-engine/yaneuraou-search.h"
#include "engine/usi.h"
#include "engine/meguru_probe.h"
#include <atomic>
#include <fstream>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <array>
#include <random>
#include <vector>
using namespace YaneuraOu;
namespace {
std::mutex serial;
std::atomic<int64_t> cancelledThrough{0}, activeRequest{0};
std::atomic<YaneuraOuEngine*> activeEngine{nullptr};
thread_local std::string answer;
std::mutex progressMutex;
struct Progress { int64_t request=0; int score=0,depth=0; uint64_t nodes=0; } progress;
void publishProgress(int64_t request,int score,int depth,uint64_t nodes){
    std::lock_guard<std::mutex> lock(progressMutex);progress={request,score,depth,nodes};
}
struct Runtime {
    YaneuraOuEngine engine;
    USIEngine usi;
    std::string configuration, gameId, best;
    uint64_t nodes=0;
    int depth=0, scoreCp=0, moveLimit=-1, searchDepth=-1;
    struct Candidate { std::string move; int cp=0, depth=0; bool mate=false; };
    std::array<Candidate,3> candidates{}, completeCandidates{};
    int variations=1;
    std::mt19937 random{std::random_device{}()};
    Runtime(){
        usi.set_engine(engine);
        engine.set_on_bestmove([this](std::string_view move,std::string_view){best=std::string(move);});
        engine.set_on_update_full([this](const Search::InfoFull& info){
            nodes=info.nodes;
            if(info.multiPV==1)depth=info.depth;
            if(variations==3 && info.multiPV>=1 && info.multiPV<=3) {
                const bool mate=info.score.is<Score::Mate>();
                std::istringstream pv{std::string(info.pv)};std::string move;pv>>move;
                candidates[info.multiPV-1]={move,mate?30000:info.score.get<Score::InternalUnits>().value,info.bound.empty()?info.depth:0,mate};
                if(candidates[0].depth>0 && candidates[0].depth==candidates[1].depth && candidates[0].depth==candidates[2].depth)
                    completeCandidates=candidates;
            }
            if(info.multiPV==1 && info.bound.empty()){
                scoreCp=info.score.is<Score::Mate>() ? (info.score.get<Score::Mate>().plies>=0?30000:-30000) : info.score.get<Score::InternalUnits>().value;
                publishProgress(activeRequest.load(),scoreCp,depth,nodes);
            }
        });
        engine.set_on_update_no_moves([](const Search::InfoShort&){});
        engine.set_on_update_string([](std::string_view){});
        engine.set_on_iter([](const Search::InfoIteration&){});
        option("Threads","1"); option("USI_Hash","32"); option("FV_SCALE","20");
        option("USI_Ponder","false"); option("EnteringKingRule","NoEnteringKing");
        option("NetworkDelay","0"); option("NetworkDelay2","0");
        option("GenerateAllLegalMoves","true"); option("PvInterval","0");
        option("OutputFailLHPV","false"); option("ResignValue","99999");
    }
    void option(const std::string& name,const std::string& value){
        usi.mobile_command("setoption name "+name+" value "+value);
    }
    void configure(const std::string& eval,const std::string& book,int mask,bool useBook,const std::string& game){
        // Bits 0/1 enable recovery for each side; bit 2 enables king recovery.
        if(mask<0||mask>7)throw std::runtime_error("Invalid rule flags");
        if(useBook&&mask!=3&&mask!=7)throw std::runtime_error("Book requires both-side recovery");
        std::ifstream file(eval+"/nn.bin",std::ios::binary|std::ios::ate);
        if(!file||file.tellg()!=64217066)throw std::runtime_error("Evaluation file is missing or invalid");
        const auto key=eval+"|"+book+"|"+std::to_string(mask)+"|"+std::to_string(useBook);
        if(configuration!=key||gameId!=game){
            engine.wait_for_search_finished();
            meguru_recovery_mask=mask & 3;meguru_king_recovery=(mask & 4)!=0;
            option("EvalDir",eval);
            option("USI_OwnBook",useBook?"true":"false");
            option("BookDir",book);
            const std::string bookFile=mask==7?"king_recovery_book.db":"user_book1.db";
            if(useBook&&!std::ifstream(book+"/"+bookFile))throw std::runtime_error("Rule-specific opening book is missing");
            option("BookFile",useBook?bookFile:"no_book");
            option("BookMoves","24"); option("BookDepthLimit","0");
            option("BookEvalBlackLimit","-99999");option("BookEvalWhiteLimit","-99999");
            option("BookEvalDiff","150");option("NarrowBook","false");option("ConsiderBookMoveCount","true");option("BookIgnoreRate","0");option("IgnoreBookPly","true");option("BookOnTheFly","false");
            usi.mobile_command("isready");usi.mobile_command("usinewgame");
            configuration=key;gameId=game;
        }
    }
};
Runtime& runtime(){
    static Runtime* instance=nullptr;
    static std::once_flag once;
    std::call_once(once,[]{
        static char program[]="meguru-mobile";
        static char* argv[]={program};
        CommandLine::g.set_arg(1,argv);
        Bitboards::init();Position::init();instance=new Runtime();
    });
    return *instance;
}
void validatePosition(const std::string& pos){
    if(pos.rfind("position sfen ",0)!=0||pos.find_first_of("\r\n")!=std::string::npos||pos.size()>100000)
        throw std::runtime_error("Invalid position command");
}
}
extern "C" const char* meguru_progress(int64_t id){
    thread_local std::string snapshot;
    std::lock_guard<std::mutex> lock(progressMutex);
    if(progress.request!=id||id<=cancelledThrough.load())snapshot="{}";
    else {
        std::ostringstream out;
        out<<"{\"scoreCp\":"<<progress.score<<",\"depth\":"<<progress.depth<<",\"nodes\":"<<progress.nodes<<"}";
        snapshot=out.str();
    }
    return snapshot.c_str();
}
extern "C" void meguru_cancel(int64_t id){
    auto old=cancelledThrough.load();
    while(old<id&&!cancelledThrough.compare_exchange_weak(old,id)){}
    auto* engine=activeEngine.load();
    if(engine&&activeRequest.load()<=id)engine->stop();
}
extern "C" const char* meguru_analyze(const char* position,const char* eval,const char* book,int mask,int useBook,int ms,const char* game,int64_t id){
    return meguru_analyze_limited(position,eval,book,mask,useBook,ms,game,id,0);
}
extern "C" const char* meguru_analyze_limited(const char* position,const char* eval,const char* book,int mask,int useBook,int ms,const char* game,int64_t id,int moveLimit){
    return meguru_analyze_configured(position,eval,book,mask,useBook,ms,game,id,moveLimit,0);
}
extern "C" const char* meguru_analyze_configured(const char* position,const char* eval,const char* book,int mask,int useBook,int ms,const char* game,int64_t id,int moveLimit,int maxDepth){
    std::lock_guard<std::mutex> lock(serial);
    try{
        if(id<=cancelledThrough.load()){answer="cancelled";return answer.c_str();}
        validatePosition(position);
        if(ms<0||ms>10000)throw std::runtime_error("Invalid thinking time");
        if(moveLimit<0||moveLimit>4999)throw std::runtime_error("Invalid move limit");
        if(maxDepth<0||maxDepth>64)throw std::runtime_error("Invalid search depth");
        const int depthLimit=ms==0?0:maxDepth;
        auto& r=runtime();r.configure(eval,book,mask,useBook,game);
        // Do not let unlimited background analysis bypass a low CPU level via cached results.
        if(r.searchDepth!=depthLimit){r.usi.mobile_command("usinewgame");r.searchDepth=depthLimit;}
        if(r.moveLimit!=moveLimit){
            r.option("MaxMovesToDraw",std::to_string(moveLimit?moveLimit+1:0));
            r.usi.mobile_command("usinewgame");r.moveLimit=moveLimit;
        }
        if(id<=cancelledThrough.load()){answer="cancelled";return answer.c_str();}
        r.usi.mobile_command(position);r.best.clear();r.nodes=0;r.depth=0;
        // Opening variety for the king-recovery rule: three independently scored lines.
        // Off-book king openings retain search variety; each rule has its own book file.
        r.variations=(mask & 4) && ms>0 && r.engine.get_position().game_ply()<=12 ? 3 : 1;
        r.candidates={};r.completeCandidates={};r.option("MultiPV",std::to_string(r.variations));
        r.scoreCp=USIEngine::to_cp(Eval::evaluate(r.engine.get_position()));
        activeRequest.store(id);activeEngine.store(&r.engine);
        publishProgress(id,r.scoreCp,0,0);
        // Continuous analysis ignores the opening book, without resetting the hash/configuration.
        r.option("USI_OwnBook",ms==0?"false":useBook?"true":"false");
        r.usi.mobile_command(ms==0?"go infinite":"go movetime "+std::to_string(ms)+(depthLimit?" depth "+std::to_string(depthLimit):""));
        if(id<=cancelledThrough.load())r.engine.stop();
        r.engine.wait_for_search_finished();activeEngine.store(nullptr);
        if(id<=cancelledThrough.load()){answer="cancelled";return answer.c_str();}
        if(r.best.empty())throw std::runtime_error("No engine response");
        int candidateCount=1;
        const auto& candidates=r.completeCandidates;
        if(r.variations==3 && std::abs(r.scoreCp)<29000 && candidates[0].move==r.best && candidates[0].depth==r.depth && !candidates[0].mate) {
            std::vector<std::string> eligible;
            for(const auto& c:candidates)
                if(!c.mate && !c.move.empty() && c.cp>=candidates[0].cp-50)eligible.push_back(c.move);
            if(!eligible.empty()) {
                candidateCount=int(eligible.size());
                r.best=eligible[std::uniform_int_distribution<size_t>(0,eligible.size()-1)(r.random)];
            }
        }
        std::ostringstream out;
        out<<"{\"bestmove\":\""<<r.best<<"\",\"nodes\":"<<r.nodes<<",\"depth\":"<<r.depth<<",\"scoreCp\":"<<r.scoreCp<<",\"openingCandidates\":"<<candidateCount<<",\"depthLimit\":"<<depthLimit<<",\"engine\":\"MeguruShogi-Mobile-1\"}";
        answer=out.str();
    }catch(const std::exception& e){activeEngine.store(nullptr);answer=std::string("error:")+e.what();}
    return answer.c_str();
}
extern "C" const char* meguru_inspect(const char* position,const char* eval,int mask){
    std::lock_guard<std::mutex> lock(serial);
    try{
        validatePosition(position);auto& r=runtime();r.configure(eval,"",mask,false,"inspection");
        r.usi.mobile_command(position);
        answer=meguru_probe_text(r.engine.get_position());
    }catch(const std::exception& e){answer=std::string("error:")+e.what();}
    return answer.c_str();
}
