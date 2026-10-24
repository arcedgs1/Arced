# Add the Daily Checklist to your existing Windows CRM

The app running on your computer does not automatically receive GitHub changes. Update the existing folder so your saved database, uploads, login and random configuration are reused.

1. In your ORIGINAL `command-center` folder, double-click `Stop-CRM` to stop the app without deleting data. Keep Docker Desktop open.
2. Download the latest ZIP from https://github.com/arcedgs1/Arced/tree/codex/arced-crm-windows using **Code > Download ZIP**. Extract it into a separate temporary folder.
3. Open `command-center` INSIDE the NEW download. Press **Ctrl+A**, then **Ctrl+C** to copy its contents.
4. Open your ORIGINAL `command-center` folder. Press **Ctrl+V**. Choose **Replace the files in the destination** when Windows asks. Copy the contents into that existing folder; do not put a second command-center folder inside it.
5. Double-click the original folder's `Start-CRM`. It rebuilds the app and applies the new database migration, keeping the existing database and uploaded files. Sign in with your existing account.
6. Choose **Daily Checklist** in the menu. Add a task, optional smaller steps, a priority, and a due date. The Today view includes overdue and undated tasks; Upcoming and Completed keep future plans and finished work available.

Keep your original `.windows.env` file; it contains your database/session configuration. It is excluded from the GitHub download and is not overwritten by these source files. Do not delete Docker volumes or use a Docker factory reset. If setup unexpectedly asks you to create a new account, stop and check that you opened the original folder rather than a new project.

Daily tasks are office-wide reminders. Linking a reminder to a job does not add a blocking item to that job's completion checklist. Automatic recurring task generation and worker access are not implemented in this update.
