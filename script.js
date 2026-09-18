/* MARKNOTES
   A Markdown notes app with folders and
   auto-save. Good for learning: nested data
   structures (folders containing notes),
   debounced auto-save, and basic Markdown
   parsing with regular expressions. */

const STORAGE_KEY = "marknotes_data";
const AUTOSAVE_DELAY = 600; // milliseconds after you stop typing

/* APP STATE
   Everything lives inside one object so it's
   easy to save the whole thing to localStorage
   in one go.

   Shape of appData:
   {
     folders: [
       {
         id: "f1",
         name: "General",
         notes: [
           { id: "n1", title: "Welcome", content: "...", updatedAt: 169999... }
         ]
       }
     ],
     selectedFolderId: "f1",
     selectedNoteId: "n1"
   } */

let appData = null;

/* LOADING AND SAVING */

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    appData = JSON.parse(saved);
  } else {
    // First time opening the app: give them a starter folder + note
    appData = {
      folders: [
        {
          id: makeId(),
          name: "General",
          notes: [
            {
              id: makeId(),
              title: "Welcome to MarkNotes",
              content:
                "# Welcome!\n\nThis is a **Markdown** notes app.\n\n" +
                "- Write on the left\n" +
                "- See the preview on the right\n" +
                "- Everything *auto-saves* as you type\n\n" +
                "Try creating a new folder or a new note using the buttons above.",
              updatedAt: Date.now(),
            },
          ],
        },
      ],
      selectedFolderId: null,
      selectedNoteId: null,
    };
    appData.selectedFolderId = appData.folders[0].id;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/* Makes a simple unique ID, good enough for a small local app */
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* HELPER: find things inside the nested data */

function getSelectedFolder() {
  return appData.folders.find((f) => f.id === appData.selectedFolderId) || null;
}

function getSelectedNote() {
  const folder = getSelectedFolder();
  if (!folder) return null;
  return folder.notes.find((n) => n.id === appData.selectedNoteId) || null;
}

/* FOLDER ACTIONS */

function handleAddFolder() {
  const name = prompt("Folder name:");
  if (!name || !name.trim()) return;

  const newFolder = { id: makeId(), name: name.trim(), notes: [] };
  appData.folders.push(newFolder);
  appData.selectedFolderId = newFolder.id;
  appData.selectedNoteId = null;

  saveData();
  renderAll();
}

function handleSelectFolder(folderId) {
  appData.selectedFolderId = folderId;
  appData.selectedNoteId = null;
  saveData();
  renderAll();
}

function handleRenameFolder(folderId) {
  const folder = appData.folders.find((f) => f.id === folderId);
  if (!folder) return;

  const newName = prompt("Rename folder:", folder.name);
  if (!newName || !newName.trim()) return;

  folder.name = newName.trim();
  saveData();
  renderAll();
}

function handleDeleteFolder(folderId) {
  const folder = appData.folders.find((f) => f.id === folderId);
  if (!folder) return;

  const confirmed = confirm(
    `Delete "${folder.name}" and all ${folder.notes.length} note(s) inside it?`,
  );
  if (!confirmed) return;

  appData.folders = appData.folders.filter((f) => f.id !== folderId);

  if (appData.selectedFolderId === folderId) {
    appData.selectedFolderId =
      appData.folders.length > 0 ? appData.folders[0].id : null;
    appData.selectedNoteId = null;
  }

  saveData();
  renderAll();
}

/* NOTE ACTIONS */

function handleAddNote() {
  const folder = getSelectedFolder();
  if (!folder) {
    alert("Create or select a folder first.");
    return;
  }

  const newNote = {
    id: makeId(),
    title: "Untitled note",
    content: "",
    updatedAt: Date.now(),
  };

  folder.notes.unshift(newNote);
  appData.selectedNoteId = newNote.id;

  saveData();
  renderAll();

  // Put the cursor straight into the title field for convenience
  document.getElementById("titleInput").focus();
  document.getElementById("titleInput").select();
}

function handleSelectNote(noteId) {
  appData.selectedNoteId = noteId;
  renderAll();
}

function handleDeleteNote() {
  const folder = getSelectedFolder();
  const note = getSelectedNote();
  if (!folder || !note) return;

  const confirmed = confirm(`Delete "${note.title}"?`);
  if (!confirmed) return;

  folder.notes = folder.notes.filter((n) => n.id !== note.id);
  appData.selectedNoteId = null;

  saveData();
  renderAll();
}

/* AUTO-SAVE
   We don't want to save on every single
   keystroke, so we wait until the user has
   paused typing for AUTOSAVE_DELAY ms before
   actually writing to localStorage. This is
   called "debouncing". */

let autosaveTimer = null;

function scheduleAutosave() {
  showSaveStatus("saving");

  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    performAutosave();
  }, AUTOSAVE_DELAY);
}

function performAutosave() {
  const note = getSelectedNote();
  if (!note) return;

  note.title = document.getElementById("titleInput").value || "Untitled note";
  note.content = document.getElementById("markdownInput").value;
  note.updatedAt = Date.now();

  saveData();
  showSaveStatus("saved");

  // Refresh the note list and preview without rebuilding the textarea
  // (rebuilding it while the user is typing would be annoying)
  renderFolderList();
  renderNoteList();
  renderPreview();
}

function showSaveStatus(status) {
  const el = document.getElementById("saveStatus");
  if (status === "saving") {
    el.textContent = "Saving...";
    el.classList.add("saving");
  } else {
    el.textContent = "All changes saved";
    el.classList.remove("saving");
  }
}

// If the user closes or refreshes the tab while a save is still
// "pending" (within the debounce delay), save immediately so
// nothing gets lost.
window.addEventListener("beforeunload", () => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    performAutosave();
  }
});

/* A SIMPLE MARKDOWN PARSER
   This is not a full Markdown implementation,
   but it covers the common cases using regular
   expressions: headings, bold, italic, code,
   links, lists, and blockquotes. */

function markdownToHtml(markdown) {
  let html = escapeHtml(markdown);

  // Code blocks: ```code``` (must run before inline code)
  html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Headings: # H1, ## H2, ### H3
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");

  // Blockquotes: > text
  html = html.replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>");

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code: `code`
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");

  // Links: [text](url)
  html = html.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank">$1</a>',
  );

  // Unordered list items: - item or * item
  html = html.replace(/^[-*] (.*)$/gm, "<li>$1</li>");
  // Wrap consecutive <li> lines in a single <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Turn remaining line breaks into <br> (but not inside the tags we just made)
  html = html.replace(/\n(?!<)/g, "<br>");

  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* RENDERING */

function renderAll() {
  renderFolderList();
  renderNoteList();
  renderEditor();
}

function renderFolderList() {
  const container = document.getElementById("folderList");
  container.innerHTML = "";

  appData.folders.forEach((folder) => {
    const item = document.createElement("div");
    item.className =
      "folder-item" +
      (folder.id === appData.selectedFolderId ? " selected" : "");

    item.innerHTML = `
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <span class="folder-count">${folder.notes.length}</span>
    `;

    item.addEventListener("click", () => handleSelectFolder(folder.id));

    // Double-click to rename, right-click to delete
    item.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      handleRenameFolder(folder.id);
    });
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      handleDeleteFolder(folder.id);
    });

    container.appendChild(item);
  });
}

function renderNoteList() {
  const container = document.getElementById("noteList");
  const titleEl = document.getElementById("notePanelTitle");
  container.innerHTML = "";

  const folder = getSelectedFolder();
  titleEl.textContent = folder ? folder.name : "Notes";

  if (!folder) {
    container.innerHTML = `<div class="empty-hint">Select a folder to see its notes.</div>`;
    return;
  }

  if (folder.notes.length === 0) {
    container.innerHTML = `<div class="empty-hint">No notes yet. Click "+ New" to add one.</div>`;
    return;
  }

  // Show most recently updated notes first
  const sortedNotes = [...folder.notes].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  sortedNotes.forEach((note) => {
    const item = document.createElement("div");
    item.className =
      "note-item" + (note.id === appData.selectedNoteId ? " selected" : "");

    const snippet = note.content.slice(0, 60).replace(/\n/g, " ");

    item.innerHTML = `
      <div class="note-item-title">${escapeHtml(note.title || "Untitled note")}</div>
      <div class="note-item-snippet">${escapeHtml(snippet) || "No content yet"}</div>
    `;

    item.addEventListener("click", () => handleSelectNote(note.id));
    container.appendChild(item);
  });
}

function renderEditor() {
  const note = getSelectedNote();
  const noneSelected = document.getElementById("noEditorSelected");
  const editorArea = document.getElementById("editorArea");

  if (!note) {
    noneSelected.classList.remove("hidden");
    editorArea.classList.add("hidden");
    return;
  }

  noneSelected.classList.add("hidden");
  editorArea.classList.remove("hidden");

  document.getElementById("titleInput").value = note.title;
  document.getElementById("markdownInput").value = note.content;

  renderPreview();
}

function renderPreview() {
  const note = getSelectedNote();
  const previewPane = document.getElementById("previewPane");
  if (!note) return;

  const currentText = document.getElementById("markdownInput").value;
  previewPane.innerHTML = markdownToHtml(currentText);
}

/* WIRE UP TYPING EVENTS
   These fields exist once in the HTML (we
   don't recreate them on every render), so we
   attach their listeners a single time here. */

document.getElementById("titleInput").addEventListener("input", () => {
  scheduleAutosave();
});

document.getElementById("markdownInput").addEventListener("input", () => {
  renderPreview(); // update the preview instantly
  scheduleAutosave(); // but only write to storage after a short pause
});

/* START THE APP */

loadData();
renderAll();
