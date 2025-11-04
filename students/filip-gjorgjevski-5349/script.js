/**
 * @file script.js
 * @description Main script for the Doctor Who Episodes Explorer application.
 * This vanilla JavaScript application fetches, displays, validates, and allows interaction
 * with a list of Doctor Who episodes. It features sorting, filtering, keyboard navigation,
 * data validation, and CSV export, all without external frameworks.
 * @version 2.0.0
 */

// --- CONFIGURATION ---

/**
 * @constant {object} CONFIG
 * @description Stores global configuration and constants for the application.
 */
const CONFIG = {
    /**
     * @property {string[]} DATA_URLS - An array of URLs to fetch episode data from.
     * The application fetches and combines data from all these sources.
     */
    DATA_URLS: [
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-01-10.json',
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-11-20.json',
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-21-30.json',
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-31-40.json',
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-41-50.json',
        'https://raw.githubusercontent.com/sweko/internet-programming-adefinater/refs/heads/preparation/data/doctor-who-episodes-51-65.json'
    ]
};

// --- STATE MANAGEMENT ---

/**
 * @type {object} state
 * @description A global object holding the application's state.
 */
let state = {
    episodes: [],        // Stores the original, unmodified list of all episodes.
    filtered: [],        // Stores the currently visible (filtered and sorted) list of episodes.
    sort: {              // Stores the current sorting configuration.
        field: 'rank',
        ascending: true
    },
    filters: {           // Stores the current values for all active filters.
        name: '',
        era: '',
        doctor: '',
        companion: ''
    },
    focusedRowIndex: -1  // Index of the currently focused table row for keyboard navigation (-1 = none).
};

// --- INITIALIZATION ---

/**
 * Main application entry point.
 * Fired when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadEpisodes();
});

/**
 * Attaches all necessary event listeners to the DOM.
 */
function setupEventListeners() {
    // Text search filter for live searching.
    document.getElementById('name-filter').addEventListener('input', e => {
        state.filters.name = e.target.value;
        applyFiltersAndSort();
    });

    // Era dropdown filter.
    document.getElementById('era-filter').addEventListener('change', e => {
        state.filters.era = e.target.value;
        applyFiltersAndSort();
    });

    // Doctor dropdown filter.
    document.getElementById('doctor-filter').addEventListener('change', e => {
        state.filters.doctor = e.target.value;
        applyFiltersAndSort();
    });

    // Companion dropdown filter.
    document.getElementById('companion-filter').addEventListener('change', e => {
        state.filters.companion = e.target.value;
        applyFiltersAndSort();
    });
    
    // CSV export button.
    document.getElementById('export-csv').addEventListener('click', exportToCSV);

    // Click listeners for each sortable table header.
    document.querySelectorAll('#episodes-table thead th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            if (state.sort.field === field) {
                // If the same header is clicked, toggle the sort direction.
                state.sort.ascending = !state.sort.ascending;
            } else {
                // If a new header is clicked, set it as the sort field and default to ascending.
                state.sort.field = field;
                state.sort.ascending = true;
            }
            applyFiltersAndSort();
        });
    });

    // A single listener on the document to handle all keyboard navigation.
    document.addEventListener('keydown', handleKeyboardNavigation);
}

// --- DATA HANDLING ---

/**
 * Fetches, combines, validates, and populates filters from the episode data.
 * Uses try-catch for robust error handling of network failures or invalid JSON.
 */
async function loadEpisodes() {
    try {
        showLoading(true);
        
        // Use Promise.all to fetch all data sources concurrently for better performance.
        const promises = CONFIG.DATA_URLS.map(url => fetch(url));
        const responses = await Promise.all(promises);

        // Check each response for network errors.
        for (const response of responses) {
            if (!response.ok) throw new Error(`Network fetch failure from ${response.url} (${response.statusText})`);
        }

        const jsonDataArray = await Promise.all(responses.map(res => res.json()));
        // Combine the 'episodes' array from each fetched file into a single flat array.
        const allEpisodes = jsonDataArray.flatMap(data => data.episodes);
        
        // Validate the combined data and display warnings if issues are found.
        const warnings = validateData(allEpisodes);
        if (warnings.length > 0) {
            warnings.forEach(w => console.warn(w)); // Log detailed warnings for developers.
            const warningsDiv = document.getElementById('validation-warnings');
            warningsDiv.textContent = `Found ${warnings.length} data quality warning(s). See console for details.`;
            warningsDiv.style.display = 'block';
        }

        state.episodes = allEpisodes;
        populateFilterDropdowns(allEpisodes); // Populate dynamic filters from the data.
        applyFiltersAndSort(); // Perform initial sort and display.
    } catch (error) {
        // Catch any error from fetching, parsing, or validation.
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

/**
 * Populates Doctor and Companion dropdowns with unique, sorted values from the dataset.
 * @param {object[]} episodes - The array of all episodes.
 */
function populateFilterDropdowns(episodes) {
    const doctorSelect = document.getElementById('doctor-filter');
    const companionSelect = document.getElementById('companion-filter');

    // Use Sets to automatically handle uniqueness.
    const uniqueDoctors = new Set();
    const uniqueCompanions = new Set();

    episodes.forEach(episode => {
        if (episode.doctor?.actor) uniqueDoctors.add(episode.doctor.actor);
        if (episode.companion?.actor) uniqueCompanions.add(episode.companion.actor);
    });

    // Sort alphabetically and create option elements.
    Array.from(uniqueDoctors).sort().forEach(actor => {
        doctorSelect.add(new Option(actor, actor));
    });

    Array.from(uniqueCompanions).sort().forEach(actor => {
        companionSelect.add(new Option(actor, actor));
    });
}

/**
 * Validates a list of episodes against a set of rules.
 * @param {object[]} episodes - The array of episode objects to validate.
 * @returns {string[]} An array of warning messages. Returns an empty array if no issues are found.
 */
function validateData(episodes) {
    const warnings = [];
    const seenRanks = new Set();
    const now = new Date();
    const requiredFields = ['rank', 'title', 'era', 'broadcast_date'];

    episodes.forEach((episode, index) => {
        const id = `Episode "${episode.title || `(Untitled at index ${index}`})"`;
        requiredFields.forEach(field => {
            if (episode[field] == null || episode[field] === '') warnings.push(`Validation Error: ${id} is missing required field '${field}'.`);
        });
        const date = normalizeDate(episode.broadcast_date);
        if (date && date > now) warnings.push(`Validation Error: ${id} has a future broadcast date.`);
        if (typeof episode.rank !== 'number' || !isFinite(episode.rank)) warnings.push(`Validation Error: ${id} has an invalid (non-numeric) rank.`);
        else if (seenRanks.has(episode.rank)) warnings.push(`Validation Error: Duplicate rank '${episode.rank}' found on ${id}.`);
        else seenRanks.add(episode.rank);
        if (typeof episode.series === 'number' && episode.series < 0) warnings.push(`Validation Error: ${id} has a negative series number.`);
    });
    return warnings;
}

// --- CORE LOGIC ---

/**
 * Applies all active filters (text and dropdowns) and sorting to the master episode list, then triggers a re-render.
 */
function applyFiltersAndSort() {
    state.focusedRowIndex = -1; // Reset keyboard focus when data is re-rendered.
    const { name, era, doctor, companion } = state.filters;
    const filterText = name.toLowerCase();
    
    let processedData = state.episodes.filter(ep => {
        // Dropdown Filters: Check for an exact match or if the filter is not set.
        const eraMatch = !era || ep.era === era;
        const doctorMatch = !doctor || ep.doctor?.actor === doctor;
        const companionMatch = !companion || ep.companion?.actor === companion;

        // Text Search Filter: Check for a partial match in several text-based fields.
        const textMatch = !filterText || (
            (ep.title?.toLowerCase() ?? '').includes(filterText) ||
            (ep.writer?.toLowerCase() ?? '').includes(filterText) ||
            (ep.director?.toLowerCase() ?? '').includes(filterText)
        );

        // An episode is included only if it matches all active filters.
        return eraMatch && doctorMatch && companionMatch && textMatch;
    });

    // Apply sorting to the filtered data.
    const { field, ascending } = state.sort;
    const direction = ascending ? 1 : -1;
    processedData.sort((a, b) => {
        const valA = getSortValue(a, field);
        const valB = getSortValue(b, field);
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * direction;
    });

    state.filtered = processedData;
    displayEpisodes(state.filtered);
}

/**
 * Handles keyboard navigation for table rows (Up/Down) and column sorting (Enter).
 * @param {KeyboardEvent} e - The keyboard event object.
 */
function handleKeyboardNavigation(e) {
    if (e.key === 'Enter' && document.activeElement.tagName === 'TH') {
        e.preventDefault();
        document.activeElement.click();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        const numRows = state.filtered.length;
        if (numRows === 0) return;
        const newIndex = state.focusedRowIndex + direction;
        state.focusedRowIndex = Math.max(0, Math.min(numRows - 1, newIndex));
        updateRowFocus();
    }
}

/**
 * Exports the currently filtered and sorted data to a CSV file.
 */
function exportToCSV() {
    const headers = ["Rank", "Title", "Series", "Era", "Year", "Director", "Writer", "Doctor", "Companion", "Cast Count"];
    const dataRows = state.filtered.map(ep => [
        ep.rank, ep.title, ep.series, ep.era,
        getYear(ep.broadcast_date),
        ep.director, ep.writer,
        formatDoctor(ep.doctor),
        formatCompanion(ep.companion),
        ep.cast?.length || 0
    ]);
    const csvContent = [
        headers.map(escapeCSV).join(','),
        ...dataRows.map(row => row.map(escapeCSV).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'doctor_who_episodes.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- DISPLAY & UI ---

/**
 * Renders the provided list of episodes into the main table.
 * @param {object[]} episodes - The array of episodes to display.
 */
function displayEpisodes(episodes) {
    const tableBody = document.getElementById('episodes-body');
    tableBody.innerHTML = '';
    updateSortHeaders();
    document.getElementById('no-results').style.display = episodes.length === 0 ? 'block' : 'none';

    episodes.forEach((episode, index) => {
        const row = tableBody.insertRow();
        const createCell = text => {
            const cell = row.insertCell();
            cell.textContent = text ?? 'N/A';
        };
        createCell(episode.rank);
        createCell(episode.title);
        createCell(episode.series);
        createCell(episode.era);
        createCell(getYear(episode.broadcast_date));
        createCell(episode.director);
        createCell(episode.writer);
        createCell(formatDoctor(episode.doctor));
        createCell(formatCompanion(episode.companion));
        createCell(episode.cast?.length || 0);
        row.addEventListener('click', () => {
            state.focusedRowIndex = index;
            updateRowFocus();
        });
    });
    updateRowFocus();
}

/**
 * Updates the visual indicators (▲/▼) on table headers.
 */
function updateSortHeaders() {
    document.querySelectorAll('#episodes-table thead th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === state.sort.field) {
            th.classList.add(state.sort.ascending ? 'sort-asc' : 'sort-desc');
        }
    });
}

/**
 * Applies a 'focused' CSS class to the currently selected row for keyboard navigation.
 */
function updateRowFocus() {
    const rows = document.getElementById('episodes-body').rows;
    for (let i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('focused', i === state.focusedRowIndex);
        if (i === state.focusedRowIndex) {
            rows[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}

// --- UTILITY FUNCTIONS ---

/**
 * Gets a comparable value from an episode object for a given sort field.
 * @param {object} ep - The episode object.
 * @param {string} field - The field to get the value for.
 * @returns {string|number} A value that can be sorted.
 */
function getSortValue(ep, field) {
    switch (field) {
        case 'doctor': return formatDoctor(ep.doctor, false).toLowerCase();
        case 'companion': return formatCompanion(ep.companion, false).toLowerCase();
        case 'cast_count': return ep.cast?.length || 0;
        case 'broadcast_date': return normalizeDate(ep.broadcast_date)?.getTime() || 0;
        default: return (ep[field] || '').toString().toLowerCase();
    }
}

/**
 * Escapes a string for use in a CSV file according to RFC 4180.
 * @param {*} value - The value to escape.
 * @returns {string} The CSV-safe string.
 */
function escapeCSV(value) {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

/**
 * Parses a date string from various possible formats into a Date object.
 * @param {string} dateStr - The date string to parse (e.g., "YYYY-MM-DD", "DD/MM/YYYY").
 * @returns {Date|null} A Date object, or null if parsing fails.
 */
function normalizeDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}$/.test(dateStr)) return new Date(dateStr, 0, 1);
    if (dateStr.includes('/')) { const [d, m, y] = dateStr.split('/'); return new Date(y, m - 1, d); }
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Formats the doctor object for display.
 * @param {object} d - The doctor object.
 * @param {boolean} includeInc - Whether to include the incarnation.
 * @returns {string} The formatted string, or "N/A".
 */
function formatDoctor(d, includeInc = true) {
    if (!d?.actor) return 'N/A';
    return includeInc ? `${d.actor} (${d.incarnation || 'N/A'})` : d.actor;
}

/**
 * Formats the companion object for display. Handles null/missing companion data.
 * @param {object} c - The companion object.
 * @param {boolean} includeChar - Whether to include the character name.
 * @returns {string} The formatted string, or "N/A".
 */
function formatCompanion(c, includeChar = true) {
    if (!c?.actor) return 'N/A';
    return includeChar ? `${c.actor} (${c.character || 'N/A'})` : c.actor;
}

/**
 * Extracts the year from a date string.
 * @param {string} dateStr - The date string.
 * @returns {number|string} The four-digit year, or "N/A".
 */
function getYear(dateStr) {
    const date = normalizeDate(dateStr);
    return date ? date.getFullYear() : 'N/A';
}

/**
 * Shows or hides the loading indicator and main content.
 * @param {boolean} isLoading - If true, shows the loading spinner.
 */
function showLoading(isLoading) {
    document.getElementById('loading').style.display = isLoading ? 'block' : 'none';
    document.getElementById('episodes-table').style.display = isLoading ? 'none' : 'table';
    if (isLoading) document.getElementById('error').style.display = 'none';
}

/**
 * Displays a formatted error message to the user.
 * @param {string} details - The technical details of the error.
 */
function showError(details) {
    const errorElement = document.getElementById('error');
    const userMessage = "Error: Could not load episodes. Please check your network connection and try again.";
    errorElement.textContent = `${userMessage}\nDetails: ${details}`;
    errorElement.style.display = 'block';
    document.getElementById('episodes-table').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
}