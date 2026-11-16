#import "MeguruBridge.h"
#include "../cpp/meguru_mobile.h"
@implementation MeguruBridge
+ (NSString *)analyze:(NSString *)position eval:(NSString *)eval book:(NSString *)book mask:(NSInteger)mask useBook:(BOOL)useBook milliseconds:(NSInteger)milliseconds game:(NSString *)game request:(double)request moveLimit:(NSInteger)moveLimit maxDepth:(NSInteger)maxDepth {
    return [NSString stringWithUTF8String:meguru_analyze_configured(position.UTF8String,eval.UTF8String,book.UTF8String,(int)mask,useBook,(int)milliseconds,game.UTF8String,(int64_t)request,(int)moveLimit,(int)maxDepth)];
}
+ (NSString *)progress:(double)request { return [NSString stringWithUTF8String:meguru_progress((int64_t)request)]; }
+ (void)cancel:(double)request { meguru_cancel((int64_t)request); }
+ (NSString *)inspect:(NSString *)position eval:(NSString *)eval mask:(NSInteger)mask {
    return [NSString stringWithUTF8String:meguru_inspect(position.UTF8String,eval.UTF8String,(int)mask)];
}
@end
