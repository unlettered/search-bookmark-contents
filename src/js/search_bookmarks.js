"use strict";

/** Constants */
const pouch = new PouchDB(DB.DB_NAME);

/** Entry */
checkInitComplete();

/** Event Listeners */
getElement(HTML.ID, "search-submit").onclick = search;
getElement(HTML.ID, "search-text").onkeyup = handleEnter;

/** Event Handlers */
function handleEnter(e) {
  if (e.keyCode == 13) {
    search();
  }
}

async function search() {
  let searchResults = [];
  const searchText = getSearchText();

  clearPrevResults();

  if (searchText.length == 0) {
    return;
  }

  try {
    searchResults = await Promise.all([...await searchUrl(searchText), ...await searchTitleContent(searchText)]);
  }
  catch (err) {
    console.error(`Error while fetching search results: ${err}`);
  }
  populateSearchResults(removeDuplicates(searchResults));
}

/** Helper Functions */
function getElement(attribute, attributeValue) {
  switch (attribute) {
    case HTML.ID:
      return document.getElementById(attributeValue);
  }
}

function disableSearch() {
  getElement(HTML.ID, "search-text").disabled = true;
  getElement(HTML.ID, "search-submit").disabled = true;
}

function enableSearch() {
  getElement(HTML.ID, "search-text").disabled = false;
  getElement(HTML.ID, "search-submit").disabled = false;
}

function getLoader() {
  let loader = "";
  const progressContent = getElement(HTML.ID, "init-progress").textContent;
  const prevLoader = progressContent[progressContent.length - 1];

  switch (prevLoader) {
    case "/":
      loader = "-";
      break;
    case "-":
      loader = "\\";
      break;
    case "\\":
      loader = "|";
      break;
    default:
      loader = "/";
      break;
  }
  return loader;
}

function hideInitProgress() {
  getElement(HTML.ID, "init-progress").classList.add("hidden");
}

function showInitProgress() {
  let progElement = getElement(HTML.ID, "init-progress");
  progElement.innerHTML = `Initialization in progress ${getLoader()}`;
}

async function checkInitComplete() {
  const progress = await browser.storage.local.get("initComplete");
  if (!progress.initComplete) {
    const initCheckId = setInterval(async () => {
      const progress = await browser.storage.local.get("initComplete");
      if (progress.initComplete) {
        hideInitProgress();
        enableSearch();
        clearInterval(initCheckId);
      }
      else {
        disableSearch();
        showInitProgress();
      }
    }, Settings.INIT_PROGRESS_CHECK);
  }
  else {
    hideInitProgress();
  }
}

function clearPrevResults() {
  getElement(HTML.ID, "search-content").innerHTML = "";

  const numResults = getElement(HTML.ID, "num-results");
  if (numResults) {
    numResults.parentNode.removeChild(numResults);
  }
}

async function searchUrl(searchText) {
  let urlResults = [];
  try {
    const results = await pouch.allDocs({ include_docs: true });
    const matches = results.rows.filter(r => r.doc.url.includes(searchText));
    matches.forEach(m => urlResults.push(buildResult(m.doc.title, m.doc.url)));
  }
  catch (error) {
    console.error(`Error while searching bookmark URLs: ${error}`);
  }
  return urlResults;
}

function buildContentResult(result) {
  const highlight = result.highlighting;
  const title = DB.TITLE in highlight ? highlight.title : result.doc.title;
  const content = DB.CONTENT in highlight ? trimContent(highlight.content) : "";

  return buildResult(title, result.doc.url, content);
}

async function searchTitleContent(searchText) {
  let contentResults = [];
  try {
    const searchQuery = {
      query: searchText,
      fields: [DB.CONTENT, DB.TITLE, DB.URL],
      include_docs: true,
      highlighting: true
    };
    const results = await pouch.search(searchQuery);
    results.rows.forEach(res => contentResults.push(buildContentResult(res)));
  }
  catch (error) {
    console.error(`Error encountered while searching content: ${error}`);
  }
  return contentResults;
}

function getSearchText() {
  return getElement(HTML.ID, "search-text").value || "";
}

function removeDuplicates(searchResults) {
  let dups = {};
  let newResults = [];

  searchResults.forEach((sr) => {
    sr.url in dups ? dups[sr.url].push(sr) : dups[sr.url] = [sr];
  });

  for (let key in dups) {
    if (dups[key].length > 1) {
      newResults.push(mergeDups(dups[key]));
    }
    else {
      newResults.push(dups[key][0]);
    }
  }
  return newResults;
}

function mergeDups(dups) {
  let res = {};
  res.url = dups[0].url;

  try {
    const titleArr = dups.filter((sr) => sr.title.includes(HTML.STRONG_START));
    res.title = titleArr.length > 0 ? titleArr[0].title : dups[0].title;
  }
  catch (err) {
    res.title = "";
  }

  try {
    const contentArr = dups.filter((sr) => sr.content.length > 0);
    res.content = contentArr.length > 0 ? contentArr[0].content : dups[0].content;
  }
  catch (err) {
    res.content = "";
  }
  return res;
}

function buildResult(title, url, content = "") {
  return {
    title: title,
    url: url,
    content: content
  };
}

function populateNumResults(res) {
  const nums = `${res.length || "No"} result${res.length <= 1 ? "" : "s"} found`;
  const numResultsDiv = createHTMLElement("div",
    {
      id: "num-results",
      class: "num-results",
    },
    nums);
  getElement(HTML.ID, "search-bar").appendChild(numResultsDiv);
}

function populateResult(result) {
  const searchResult = createHTMLElement("li");
  const link = createHTMLElement("a",
    {
      href: result.url,
      title: result.title.replace(HTML.STRONG_START, "").replace(HTML.STRONG_END, "")
    },
    trimTitle(result.title));
  const searchResContent = createHTMLElement("span",
    {
      class: "search-result-content"
    },
    result.content);
  const linebreak = document.createElement("br");

  searchResult.append(link, linebreak, searchResContent);
  getElement(HTML.ID, "search-content").appendChild(searchResult);
}

function populateSearchResults(searchResults) {
  populateNumResults(searchResults);
  searchResults.forEach(populateResult);
}

function createHTMLElement(tagName, attrs, innerHTML) {
  let element = document.createElement(tagName);
  for (let attr in attrs) {
    const attributeValue = attrs[attr];
    element.setAttribute(attr, attributeValue);
  }
  if (innerHTML) {
    element.innerHTML = innerHTML;
  }
  return element;
}

function trimContent(content) {
  const start = content.indexOf(HTML.STRONG_START);
  const startSlice = start - Settings.CONTENT_PRE < 0 ? 0 : start - Settings.CONTENT_PRE;
  const endSlice = start + Settings.CONTENT_POST < content.length ? start + Settings.CONTENT_POST : content.length;

  const pre = startSlice > 0 ? `... ` : "";
  const post = endSlice < content.length ? ` ...` : "";

  return pre + content.slice(startSlice, endSlice) + post;
}

function trimTitle(title) {
  const titleArr = title.split(" ");
  let trimmedTitle = title;

  if (titleArr.length > Settings.MAX_DISPLAY_TITLE_LEN) {
    trimmedTitle = titleArr.slice(0, Settings.MAX_DISPLAY_TITLE_LEN).join(" ") + ` ...`;
  }
  return trimmedTitle;
}
