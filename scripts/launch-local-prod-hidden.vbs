Set shell = CreateObject("WScript.Shell")

projectRoot = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
projectRoot = CreateObject("Scripting.FileSystemObject").GetParentFolderName(projectRoot)

cmd = "cmd.exe /c cd /d """ & projectRoot & """ && " & _
      "set APP_DB_TARGET=local&& " & _
      "set DATABASE_URL=file:./prisma/dev.db&& " & _
      "set HOSTNAME=127.0.0.1&& " & _
      "set PORT=3000&& " & _
      "npm.cmd run prod:local 1>>logs\prod-local.log 2>>logs\prod-local.err.log"

shell.Run cmd, 0, False
