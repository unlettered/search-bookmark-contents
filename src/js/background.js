"use strict";

/** Constants */
const pouch = new PouchDB(DB.DB_NAME);

/** Entry */
initialise();

/** Event Listeners */
browser.bookmarks.onCreated.addListener(handleCreateBookmark);
browser.bookmarks.onRemoved.addListener(handleRemoveBookmark);

/** Event Handlers */
async function handleCreateBookmark(_, bookmarkInfo) {
  try {
    await browser.storage.local.set({ "initComplete": false });
    await handleContentFetchQueue(populateIdQueue(bookmarkInfo));
    const buildRes = await buildIndex();
    if (buildRes && buildRes.ok) {
      browser.storage.local.set({ "initComplete": true });
    }
  }
  catch (err) {
    console.error(`Error after create bookmark: ${err}`);
  }
  
}

async function handleRemoveBookmark(_, removeInfo) {
  const removedItem = removeInfo.node;

  try {
    if (removedItem.url) {
      const result = await removeUrl(removedItem);
      if (result && !result.ok) {
        console.error(result);
      }
    }
    else {
      const removeResults = await removeFolder();
      removeResults.forEach(res => {
        if (res && !res.ok) {
          console.error(`Error removing doc with id: ${res.id}`);
        }
      });
    }
    let buildRes = await buildIndex();
    if (buildRes && !buildRes.ok) {
      console.error(buildRes);
    }
  }
  catch (err) {
    console.error(`Error after removing bookmark(s): ${err}`);
  }
}

/** Helper Functions */
async function initialise() {
  try {
    await browser.storage.local.set({ "initComplete": false });
    const bookmarkRoot = getBookmarkRoot(await browser.bookmarks.getTree());
    await handleContentFetchQueue(populateIdQueue(bookmarkRoot));
    const buildRes = await buildIndex();
    if (buildRes && buildRes.ok) {
      await browser.storage.local.set({ "initComplete": true });
    }
  }
  catch (err) {
    console.error(`Error initializing data: ${err}`);
  }
}

function getBookmarkRoot(bookmarkItems) {
  return bookmarkItems[0];
}

function populateIdQueue(bookmarkItem, idQueue = []) {
  if (bookmarkItem.url) {
    idQueue.push(bookmarkItem.id);
  }
  if (bookmarkItem.children) {
    for (let child of bookmarkItem.children) {
      populateIdQueue(child, idQueue);
    }
  }
  return idQueue;
}

function createId(id, url) {
  return url.replace(/([a-zA-Z]*\:\/\/)/, "") + "|" + id;
}

function populateDoc(id, url, title, content) {
  return {
    _id: createId(id, url),
    title: title,
    url: url,
    content: content
  };
}

function stripScript(htmlString) {
  let strippedHTML = "";

  try {
    let doc = document.implementation.createHTMLDocument();
    let tempDiv = doc.createElement("div");
    tempDiv.innerHTML = htmlString;
    const scripts = tempDiv.getElementsByTagName("script");
    let i = scripts.length;

    while (i--) {
      scripts[i].parentNode.removeChild(scripts[i]);
    }
    strippedHTML = tempDiv.innerHTML;
  }
  catch (err) {
    console.error(`Error removing script tags: ${err}`);
  }
  return strippedHTML;
}

async function createDoc(bookmarkItem) {
  const domparser = new DOMParser();
  let content;
  try {
    const res = await fetch(bookmarkItem.url);

    if (res.ok) {
      const responseText = await res.text();
      const htmlNoScript = stripScript(responseText);
      let htmlTextContent = domparser.parseFromString(htmlNoScript, "text/html");
      content = htmlTextContent.body.textContent.replace(/\s\s+/g, " ") || "";
    }
    else {
      content = `-_- Content unavailable: ${res.status}: ${res.statusText}`;
    }
  }
  catch (err) {
    console.error(`Error creating doc for ${bookmarkItem.url}: ${err}`);
  }
  
  return populateDoc(bookmarkItem.id, bookmarkItem.url, bookmarkItem.title, content);
}

async function populateBookmark(id) {
  let result;

  try {
    const bookmarkItem = (await browser.bookmarks.get(id))[0];
    const doc = await createDoc(bookmarkItem);
    if (doc) {
      result = pouch.put(doc);
    }
  }
  catch (err) {
    console.error(`Error populating bookmark ${id}: ${err}`);
  }
  return result;
}

async function handleContentFetchQueue(idQueue) {
  let results = [];
  idQueue.forEach(id => results.push(populateBookmark(id)));
  return Promise.all(results);
}

async function deleteDoc(id) {
  let result;
  try {
    const doc = await pouch.get(id);
    result = pouch.remove(doc._id, doc._rev);
  }
  catch (err) {
    console.error(`Error while deleting doc with id: ${id}: ${err}`);
  }
  return result;
}

async function removeUrl(removedItem) {
  let result;
  try {
    result = await deleteDoc(createId(removedItem.id, removedItem.url));
  }
  catch (err) {
    console.error(`Error while removing doc: ${err}`);
  }
  return result;
}

async function removeFolder() {
  let results = [];
  try {
    const [idsInDb, allBookmarkIds] = await Promise.all([await getDocIds(), await fetchAllBookmarkIds()]);

    const docsToRemove = idsInDb.filter(x => !allBookmarkIds.includes(x));
    docsToRemove.forEach(id => results.push(deleteDoc(id)));
  }
  catch (err) {
    console.error(`Error removing folder: ${err}`);
  }
  return Promise.all(results);
}

async function fetchAllBookmarkIds() {
  const bookmarkItems = await browser.bookmarks.getTree();
  return getAllBookmarkIds(getBookmarkRoot(bookmarkItems));
}

function getAllBookmarkIds(bookmarkItem, ids = []) {
  if (bookmarkItem.url) {
    ids.push(createId(bookmarkItem.id, bookmarkItem.url));
  }
  if (bookmarkItem.children) {
    for (let child of bookmarkItem.children) {
      getAllBookmarkIds(child, ids);
    }
  }
  return ids;
}

async function getDocIds() {
  let docIds = [];
  try {
    const result = await pouch.allDocs();
    result.rows.forEach(doc => docIds.push(doc.id));
  }
  catch (err) {
    console.error(`Error while fetching ids from db: ${err}`);
    docIds = [];
  }
  return docIds;
}

async function buildIndex() {
  return pouch.search({
    fields: [DB.CONTENT, DB.TITLE, DB.URL],
    build: true
  });
}
