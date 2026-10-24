# Run ARCED CRM on your Windows computer

This runs locally on your own computer, without a monthly hosting subscription. Internet is needed for the first software download. The computer and Docker Desktop must be running when you use the CRM. This does not create a public website or enable phone access.

1. Install Docker Desktop for Windows from https://www.docker.com/products/docker-desktop/ . Choose the installer for your computer (most Intel/AMD Windows computers use AMD64). Follow its prompts for WSL 2 and restart Windows if requested. Docker licensing depends on use and organization size; check its displayed terms.
2. Open Docker Desktop and wait for its engine to finish starting.
3. Extract the CRM source ZIP into a normal folder, such as Documents\ARCED-CRM. Do not run it from inside the ZIP.
4. Double-click `Start-CRM.bat`. Keep the window open; first startup can take several minutes while it downloads and builds the app.
5. On the first launch, enter your email and choose a password of 12 to 200 characters. Type these only in the local setup window, never in chat. Setup creates an owner account and service divisions, with no fictional client records. Remember your password: password reset is not implemented yet.
6. The script opens your browser when the CRM is ready. Sign in with the email and password you chose. Later launches reuse your saved account and data.

To stop: double-click `Stop-CRM.bat`. This stops the services without deleting the database or uploads. Do not delete Docker volumes or choose a Docker factory reset if you need to retain local data. The separate backup instructions in README cover exporting the database and private files.

The starter creates a `.windows.env` file with random database/session secrets; leave it in the extracted folder and do not share it. Your chosen login password is passed temporarily to the setup command and stored in the database as a password hash, not written into that file.

If Windows blocks a downloaded script, review these text scripts first, then use the file's Properties > Unblock option when Windows offers it. The batch file permits this packaged PowerShell script for that one process; it does not permanently change your execution policy. If organizational security policy blocks scripts, ask your administrator rather than disabling that policy.

If you see an error, copy its text without any passwords. The Windows launchers have been prepared here but have not been executed on a Windows machine. Docker image startup is not yet verified in this cloud environment; this package is a development build with known unfinished features listed in REQUIREMENTS.md.
