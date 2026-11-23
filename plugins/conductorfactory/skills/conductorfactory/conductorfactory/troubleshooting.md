# Factory troubleshooting and known issues

## Adding a screenshot or recording to an issue

From the command line, with `--attach` (repeat it per file; `#` adds alt text to an image):

```sh
gh issue create --title "<title>" --body-file issue.md --label "factory:queue" \
  --attach ./before.png --attach './after.png#The list after the fix'
gh issue comment <number> --body "What it looks like now" --attach ./screen.mp4
```

To place an image at a point in the text, write a Markdown image in the body whose path is the
local file, and attach the same file: the path is rewritten to the uploaded copy. Files the body
does not mention are added at the end.

Known issues:

- **`unknown flag: --attach`** means the GitHub CLI is too old. Upgrade it (`brew upgrade gh`) and
  check with `gh issue create --help`.
- **Images and videos only.** Logs, PDFs, archives and other files are refused: paste the relevant
  lines into the body as text instead.
- **You need push access** to the repository to attach files.
- **A video shows as a player only when it stands alone in its own paragraph**, and takes no alt text.
- **If some files upload and others fail**, the issue or comment is still created without the
  failed ones: read the command's output and add the missing files in a follow-up comment.
- **In the browser instead:** open the issue, click into the description or a comment box, and
  drag the file in or paste it from the clipboard. This is the fallback when the command line
  cannot attach, the only way to attach a file type the command line refuses, and the only way
  at all for an assistant without a command line (for example instinct), which must be signed in
  to GitHub in its browser.
- **Treat an upload as permanent.** Assume its link keeps working even if the comment is deleted
  later, so crop or blur private details (names, messages, tokens) before attaching, never after.

## Several people, one repository

- **An issue nobody picks up.** It is assigned to someone whose factory is not running, or it is
  unassigned and was created by a login no factory claims for. `conductorfactory/run issue owner
  <number>` says who owns it; assign it to someone whose factory is running.
- **`start` says the runs belong to another Factory home.** This login already ran them from
  another checkout or machine. Stop that one, or if it is gone run `conductorfactory/run start
  --takeover` to continue them here.
- **A reassigned issue sits for a few minutes.** The new owner's factory waits for the previous
  one to push its work and let go (`github.handoverWaitMinutes`), then takes over anyway.
- **One Coordinator per GitHub login per repository.** A second one on the same machine is
  refused. Across machines it is only caught while runs are in flight, so do not run two.
