/*
 *
 * Robert Gerdisch (2019)
 *
 * https://developer.chrome.com/extensions/bookmarks#type-BookmarkTreeNode
 *
 */

var allBookmarks;

function init() {
    allBookmarks = [];
}

function loadBookmarks(children, rootId) {
    if (!children) return;

    children.forEach((child) => {
        if ((!!child.url) && (child.parentId != rootId)) allBookmarks.push(child);
        loadBookmarks(child.children);
    });
}

function divideByYear(parentId, children) {
    return new Promise(resolve => {
        p_divideByYear(parentId, children, resolve);
    });
}

function p_divideByYear(parentId, children, resolve) {
    var minYear = new Date(children[0].dateAdded).getFullYear();
    var maxYear = new Date(children[children.length - 1].dateAdded).getFullYear();
    var numYears = (maxYear - minYear) + 1;
    var yearFolderIds = [];

    for (var year = minYear; year <= maxYear; year++) {
        chrome.bookmarks.create({
            parentId,
            index: year - minYear,
            title: `${year}`
        }, (yearFolder) => {
            var year = parseInt(yearFolder.title);
            var childIndex = -1;
            var latestChild = 0;
            var yearStartIndex = -1;
            do {
                var currentChild = children[++childIndex];
                var yearAdded = new Date(currentChild.dateAdded).getFullYear();
                if (yearAdded == year) {
                    if (yearStartIndex == -1)
                        yearStartIndex = childIndex;

                    chrome.bookmarks.move(
                        currentChild.id, 
                        {
                            parentId: yearFolder.id,
                            index: childIndex - yearStartIndex
                        }
                    );
                }
                latestChild = yearAdded;
            } while(latestChild <= year && childIndex < children.length - 1);
            yearFolderIds.push(yearFolder.id);
            if (yearFolderIds.length == numYears)
                resolve(yearFolderIds);
        });
    }
}

function divideBySeason(parentId, children) {
    return new Promise(resolve => {
        p_divideBySeason(parentId, children, resolve);
    });
}

// Winter: Dec, Jan, Feb [11, 00, 01]
// Spring: Mar, Apr, May [02, 03, 04]
// Summer: Jun, Jul, Aug [05, 06, 07]
// Autumn: Sep, Oct, Nov [08, 09, 10]
function p_divideBySeason(parentId, children, resolve) {
    var seasonFolderIds = [];

    var seasons = [
        { name: 'Winter', months: [11, 0, 1], bookmarks: [] },
        { name: 'Spring', months: [2, 3, 4], bookmarks: [] },
        { name: 'Summer', months: [5, 6, 7], bookmarks: [] },
        { name: 'Autumn', months: [8, 9, 10], bookmarks: [] },
    ];

    children.forEach((child) => {
        var monthAdded = new Date(child.dateAdded).getMonth();
        seasons.forEach((season) => {
            if (season.months.includes(monthAdded))
                season.bookmarks.push(child);
        });
    });

    var numSeasonFolders = 0;
    seasons.forEach((season) => { 
        if (!season.bookmarks) return;
        ++numSeasonFolders;
    });

    seasons.forEach((season, seasonIndex) => {
        if (!season.bookmarks) return;
        chrome.bookmarks.create({
            parentId,
            index: seasonIndex,
            title: season.name
        }, (seasonFolder) => {
            season.bookmarks.forEach((bookmark, bookmarkIndex) => {
                chrome.bookmarks.move(
                    bookmark.id, 
                    {
                        parentId: seasonFolder.id,
                        index: bookmarkIndex
                    }
                );
            });

            seasonFolderIds.push(seasonFolder.id);
            if (seasonFolderIds.length == numSeasonFolders)
                resolve(seasonFolderIds);
        });
    });
}

function divideByMonth(parentId, children) {
    return new Promise(resolve => {
        p_divideByMonth(parentId, children, resolve);
    });
}

function p_divideByMonth(parentId, children, resolve) {
    var months = [
        { name: 'January', bookmarks: [] },
        { name: 'February', bookmarks: [] },
        { name: 'March', bookmarks: [] },
        { name: 'April', bookmarks: [] },
        { name: 'May', bookmarks: [] },
        { name: 'June', bookmarks: [] },
        { name: 'July', bookmarks: [] },
        { name: 'August', bookmarks: [] },
        { name: 'September', bookmarks: [] },
        { name: 'October', bookmarks: [] },
        { name: 'November', bookmarks: [] },
        { name: 'December', bookmarks: [] },
    ];
    
    var smallestMonth = 13;

    children.forEach((child) => {
        var monthAdded = new Date(child.dateAdded).getMonth();

        months[monthAdded].bookmarks.push(child);

        if (smallestMonth > monthAdded) smallestMonth = monthAdded;
    });

    var monthFolderIds = [];

    var numMonthFolders = 0;
    months.forEach((month) => {
        if (!month.bookmarks) return;
        ++numMonthFolders;
    });

    months.forEach((month, monthIndex) => {
        if ((monthIndex < smallestMonth) || (!month.bookmarks.length)) return;
        chrome.bookmarks.create({
            parentId,
            index: (monthIndex - smallestMonth),
            title: month.name
        }, (monthFolder) => {
            month.bookmarks.forEach((bookmark, bookmarkIndex) => {
                chrome.bookmarks.move(
                    bookmark.id, 
                    {
                        parentId: monthFolder.id,
                        index: bookmarkIndex
                    }
                );
            });

            monthFolderIds.push(monthFolder.id);
            if (monthFolderIds.length )
                resolve(monthFolderIds);
        });
    });
}

function cleanUpFolders(newRootId, children) {
    children.forEach((child) => {
        if ((child.id == newRootId) || (!!child.url)) return;

        chrome.bookmarks.removeTree(child.id);
    });
}

function manageBookmarks() {
    chrome.bookmarks.getTree((nodes) => {
        let globalBookmarksRoot = nodes[0];
        let bookmarksBar = globalBookmarksRoot.children[0];
        loadBookmarks(bookmarksBar.children, bookmarksBar.id);
        allBookmarks.sort((a, b) => a.dateAdded - b.dateAdded);

        chrome.bookmarks.create({
            parentId: bookmarksBar.id,
            title: "Bookmarks"
        }, async (newRoot) => {
            var yearFolderIds = await divideByYear(newRoot.id, allBookmarks);

            // Everything is in the new root, clean up.
            chrome.bookmarks.getTree((nodes) => {
                cleanUpFolders(newRoot.id, nodes[0].children[0].children);
            });
            
            yearFolderIds.forEach((yearFolderId) => {
                chrome.bookmarks.getChildren(yearFolderId, async (children) => {
                    if (children.length < 20) return;

                    var seasonFolderIds = await divideBySeason(yearFolderId, children);

                    seasonFolderIds.forEach((seasonFolderId) => {
                        chrome.bookmarks.getChildren(seasonFolderId, async (children) => {
                            if (children.length < 30) return;

                            var monthFolderIds = await divideByMonth(seasonFolderId, children);
                        });
                    });
                });
            });
            
        });
    });
}

function runManage() {
    init();
    button.disabled = true;
    manageBookmarks();
}

window.onload = () => { document.getElementById("button").onclick = runManage };
