@echo off
rem Creates (or refreshes) the "Trener" shortcut on the desktop, with the piano icon.
rem Removes the old desktop Trener.bat that only started this folder's Trener.bat.
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Trener.lnk')); $s.TargetPath='%HERE%Trener.bat'; $s.WorkingDirectory='%HERE%'; $s.IconLocation='%HERE%Trener.ico,0'; $s.WindowStyle=7; $s.Description='Trener pianina'; $s.Save(); $old=Join-Path $d 'Trener.bat'; if ((Test-Path $old) -and (Select-String -Path $old -Pattern 'CodexPedalModes' -Quiet)) { Remove-Item $old; 'Stary Trener.bat z pulpitu usuniety.' }; 'Skrot Trener jest na pulpicie.'"
pause
