// Offline research only. Fixed rules: both sides may recover, including kings.
#include "engine/engine/yaneuraou-engine/yaneuraou-search.h"
#include "engine/usi.h"
#include "engine/meguru_probe.h"
int main(int argc,char** argv){
 using namespace YaneuraOu;
 CommandLine::g.set_arg(argc,argv);Bitboards::init();Position::init();
 meguru_recovery_mask=3;meguru_king_recovery=true;
 YaneuraOuEngine engine;USIEngine usi;usi.set_engine(engine);usi.loop();
}
