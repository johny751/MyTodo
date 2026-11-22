$ErrorActionPreference = 'Stop'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcut = $shortcutShell.CreateShortcut((Join-Path $desktopPath '高效 ToDo Windows 原生版.lnk'))
$shortcut.TargetPath = 'C:/Users/adwoo/Documents/ChatGPT/REA复刻项目/dist/GxTodo-Native-0.9.2.exe'
$shortcut.WorkingDirectory = 'C:/Users/adwoo/Documents/ChatGPT/REA复刻项目'
$shortcut.Description = '高效 ToDo 原生 C 版，直接使用 SQLite，无需网页服务'
$shortcut.IconLocation = 'C:/Users/adwoo/Documents/ChatGPT/REA复刻项目/dist/GxTodo-Native-0.9.2.exe'
$shortcut.Save()
