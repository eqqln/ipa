# Theos 编译配置：iOS 网络验证插件
# 编译：make clean && make package（需先安装 Theos）
TARGET := iphone:clang:latest:12.0
ARCHS = arm64

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = VerifyPlugin
VerifyPlugin_FILES = VerifyPlugin.m
VerifyPlugin_FRAMEWORKS = UIKit Foundation
VerifyPlugin_CFLAGS = -fobjc-arc -Wno-unused-parameter

include $(THEOS_MAKE_PATH)/tweak.mk

after-install::
	install.exec "killall -9 SpringBoard || true"
