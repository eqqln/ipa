//
//  MachOInjector.h
//  向 Mach-O 注入 LC_LOAD_DYLIB，让目标 App 启动时加载验证插件
//  支持 Thin(32/64bit) 与 FAT 多架构，零外部依赖
//
#import <Foundation/Foundation.h>

@interface MachOInjector : NSObject

/**
 * 向指定 Mach-O 文件注入加载命令，使其加载名为 dylibName 的插件
 * @param dylibName  插件文件名，如 VerifyPlugin.dylib（约定位于 Frameworks/ 下）
 * @param path       主可执行文件 Mach-O 路径
 * @param error      错误信息
 * @return YES=注入成功或已存在；NO=失败
 */
+ (BOOL)injectDylibNamed:(NSString *)dylibName
           intoMachOAtPath:(NSString *)path
                     error:(NSError **)error;

@end
