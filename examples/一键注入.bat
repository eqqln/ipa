@echo off
chcp 65001 >nul
title IPA 一键注入授权插件 - Windows

echo ==================================================
echo   IPA 一键注入授权插件
echo ==================================================
echo.
echo  说明：注入这步在 Windows 上就能跑；
echo        但编译 dylib 和重签名需要 macOS（见下方提示）。
echo.

set SCRIPT_DIR=%~dp0
set INJECTOR=%SCRIPT_DIR%..\ipa-injector\inject.py

echo 请把你的 IPA 放到本目录，然后填写下面的信息：
echo.
set /p IPA_FILE=原始 IPA 文件名（例：MyApp.ipa）:
set /p DYLIB_FILE=插件 dylib 文件名（例：VerifyPlugin.dylib）:
set /p APP_KEY=AppKey（例：AK_CC34D1A228F73094）:
set /p APP_SECRET=AppSecret:
set /p SERVER=服务器地址（例：https://verify.example.com）:
set /p OUT_FILE=输出文件名（例：MyApp_已授权.ipa）:

echo.
echo 开始注入...
python "%INJECTOR%" ^
  --ipa "%SCRIPT_DIR%%IPA_FILE%" ^
  --dylib "%SCRIPT_DIR%%DYLIB_FILE%" ^
  --app-key "%APP_KEY%" ^
  --app-secret "%APP_SECRET%" ^
  --server "%SERVER%" ^
  --output "%SCRIPT_DIR%%OUT_FILE%"

echo.
echo 完成！成品在本目录：%OUT_FILE%
echo 注意：Windows 产出的 IPA 未签名，请拿到 macOS 重签名后再安装。
pause
