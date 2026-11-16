#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface MeguruBridge : NSObject
+ (NSString *)analyze:(NSString *)position eval:(NSString *)eval book:(NSString *)book mask:(NSInteger)mask useBook:(BOOL)useBook milliseconds:(NSInteger)milliseconds game:(NSString *)game request:(double)request moveLimit:(NSInteger)moveLimit maxDepth:(NSInteger)maxDepth;
+ (NSString *)progress:(double)request;
+ (void)cancel:(double)request;
+ (NSString *)inspect:(NSString *)position eval:(NSString *)eval mask:(NSInteger)mask;
@end
NS_ASSUME_NONNULL_END
