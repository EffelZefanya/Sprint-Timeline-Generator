// State
let state = {
    sprintStart: null,
    sprintEnd: null,
    holidays: [], // Array of { date, description }
    tickets: [], // { id, person, role, ticketName, mandays, order, computedStartIdx, computedEndIdx }
    workingDays: [], // Array of { dateObj, dateStr }
    skippedHolidays: [] // Array of { dateObj, dateStr, holidayDesc }
};

const TICKET_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#14b8a6'];

// DOM Elements
const elements = {
    sprintStart: document.getElementById('sprintStart'),
    sprintEnd: document.getElementById('sprintEnd'),
    csvUpload: document.getElementById('csvUpload'),
    fileNameDisplay: document.getElementById('fileNameDisplay'),
    exportBtn: document.getElementById('exportBtn'),
    timelinePlaceholder: document.getElementById('timelinePlaceholder'),
    timelineView: document.getElementById('timelineView'),
    timelineGrid: document.getElementById('timelineGrid'),
    bottomPanels: document.getElementById('bottomPanels'),
    summaryContent: document.getElementById('summaryContent'),
    legendContent: document.getElementById('legendContent')
};

// Initialize
function init() {
    const today = new Date();
    const twoWeeks = new Date();
    twoWeeks.setDate(today.getDate() + 14);

    elements.sprintStart.value = today.toISOString().split('T')[0];
    elements.sprintEnd.value = twoWeeks.toISOString().split('T')[0];

    updateDates();

    elements.sprintStart.addEventListener('change', updateDates);
    elements.sprintEnd.addEventListener('change', updateDates);
    elements.csvUpload.addEventListener('change', handleFileUpload);
    elements.exportBtn.addEventListener('click', handleExport);
}

// Format Date as YYYY-MM-DD
function formatDate(date) {
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
}

async function fetchHolidays(year) {
    try {
        const response = await fetch(`https://api-hari-libur.vercel.app/api?year=${year}`);
        if (!response.ok) return [];
        const json = await response.json();
        
        // The API returns the array inside a "data" property
        const data = json.data || [];
        
        return data
            .filter(item => !item.description.toLowerCase().includes('cuti bersama'))
            .map(item => ({
                date: item.holiday_date || item.date,
                description: item.description
            }));
    } catch (error) {
        console.warn("Failed to fetch holidays via API (CORS issue). Using fallback data.");
        if (year === 2026) {
            const fallbackData = [{"date":"2026-01-01","description":"Tahun Baru 2026 Masehi"},{"date":"2026-01-16","description":"Isra Mi’raj Nabi Muhammad SAW"},{"date":"2026-02-17","description":"Tahun Baru Imlek 2577 Kongzili"},{"date":"2026-03-18","description":"Cuti Bersama Hari Suci Nyepi Tahun Baru Saka 1948"},{"date":"2026-03-19","description":"Hari Suci Nyepi Tahun Baru Saka 1948"},{"date":"2026-03-20","description":"Cuti Bersama Hari Raya Idul Fitri 1447 Hijriyah"},{"date":"2026-03-21","description":"Hari Raya Idul Fitri 1447 Hijriyah"},{"date":"2026-03-22","description":"Hari Raya Idul Fitri 1447 Hijriyah"},{"date":"2026-03-23","description":"Cuti Bersama Hari Raya Idul Fitri 1447 Hijriyah"},{"date":"2026-03-24","description":"Cuti Bersama Hari Raya Idul Fitri 1447 Hijriyah"},{"date":"2026-04-03","description":"Wafat Yesus Kristus / Jumat Agung"},{"date":"2026-04-05","description":"Kebangkitan Yesus Kristus (Paskah)"},{"date":"2026-05-01","description":"Hari Buruh Internasional"},{"date":"2026-05-14","description":"Kenaikan Yesus Kristus"},{"date":"2026-05-15","description":"Cuti Bersama Kenaikan Yesus Kristus"},{"date":"2026-05-27","description":"Hari Raya Idul Adha 1447 Hijriyah"},{"date":"2026-05-28","description":"Cuti Bersama Hari Raya Idul Adha 1447 Hijriyah"},{"date":"2026-05-31","description":"Hari Raya Waisak 2570 BE"},{"date":"2026-06-01","description":"Hari Lahir Pancasila"},{"date":"2026-06-16","description":"Tahun Baru Islam 1448 Hijriyah"},{"date":"2026-08-17","description":"Hari Kemerdekaan Republik Indonesia"},{"date":"2026-08-25","description":"Maulid Nabi Muhammad SAW"},{"date":"2026-12-24","description":"Cuti Bersama Hari Raya Natal"},{"date":"2026-12-25","description":"Hari Raya Natal"}];
            return fallbackData
                .filter(item => !item.description.toLowerCase().includes('cuti bersama'))
                .map(item => ({ date: item.date, description: item.description }));
        }
        return [];
    }
}

async function updateDates() {
    const startVal = elements.sprintStart.value;
    const endVal = elements.sprintEnd.value;
    
    if (!startVal || !endVal) return;

    state.sprintStart = new Date(startVal);
    state.sprintEnd = new Date(endVal);

    const startYear = state.sprintStart.getFullYear();
    const endYear = state.sprintEnd.getFullYear();
    
    const holidaysMap = new Map();
    const holidaysStart = await fetchHolidays(startYear);
    holidaysStart.forEach(h => holidaysMap.set(h.date, h.description));
    
    if (startYear !== endYear) {
        const holidaysEnd = await fetchHolidays(endYear);
        holidaysEnd.forEach(h => holidaysMap.set(h.date, h.description));
    }
    
    state.holidays = Array.from(holidaysMap, ([date, description]) => ({ date, description }));

    generateWorkingDays();
    if (state.tickets.length > 0) {
        calculateTimeline();
        renderTimeline();
    }
}

function generateWorkingDays() {
    state.workingDays = [];
    state.skippedHolidays = [];
    let currentDate = new Date(state.sprintStart);
    const endDate = new Date(state.sprintEnd);

    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = formatDate(currentDate);
        
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const holidayMatch = state.holidays.find(h => h.date === dateStr);
        const isHoliday = !!holidayMatch;
        const isWorking = !isWeekend && !isHoliday;

        if (isWorking) {
            state.workingDays.push({
                dateObj: new Date(currentDate),
                dateStr: dateStr
            });
        }
        
        if (isHoliday) {
            state.skippedHolidays.push({
                dateObj: new Date(currentDate),
                dateStr: dateStr,
                holidayDesc: holidayMatch.description
            });
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    elements.fileNameDisplay.textContent = file.name;

    if (file.name.endsWith('.xlsx')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];
        processXLSXData(worksheet);
    } else {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processCSVData(results.data);
            }
        });
    }
}

function processCSVData(data) {
    state.tickets = [];
    const personOrders = {};

    data.forEach((row, index) => {
        const getCol = (names) => {
            const key = Object.keys(row).find(k => names.includes(k.toLowerCase().trim()));
            return key ? row[key].trim() : '';
        };

        const person = getCol(['name', 'assignee', 'person']);
        const role = getCol(['role', 'job', 'position']) || 'Developer';
        const ticketName = getCol(['ticket name', 'ticket', 'task', 'title']);
        let mandays = parseFloat(getCol(['mandays', 'man days', 'effort', 'days']));

        if (person && ticketName && !isNaN(mandays)) {
            if (!personOrders[person]) personOrders[person] = 0;
            
            state.tickets.push({
                id: `ticket_${index}`,
                person,
                role,
                ticketName,
                mandays,
                order: personOrders[person]++
            });
        }
    });

    if (state.tickets.length > 0) {
        showTimeline();
    }
}

function processXLSXData(worksheet) {
    state.tickets = [];
    const personOrders = {};
    let parsedWorkingDays = [];
    
    // Parse Row 1 for dates (Assignee, Role, Date1...)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        if (colNumber > 2 && cell.value) { // Skip Assignee and Role columns
            parsedWorkingDays.push(cell.value);
        }
    });

    if (parsedWorkingDays.length > 0) {
        elements.sprintStart.value = parsedWorkingDays[0];
        elements.sprintEnd.value = parsedWorkingDays[parsedWorkingDays.length - 1];
    }

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const person = row.getCell(1).value;
        const role = row.getCell(2).value || 'Developer';
        if (!person) return;
        
        if (!personOrders[person]) personOrders[person] = 0;

        let currentTicketName = null;
        let tempMandayCount = 0;

        for (let col = 3; col <= parsedWorkingDays.length + 2; col++) {
            const cellValue = row.getCell(col).value;
            
            if (cellValue) {
                if (currentTicketName === cellValue) {
                    tempMandayCount++;
                } else {
                    if (currentTicketName) {
                        state.tickets.push({
                            id: `ticket_${state.tickets.length}`,
                            person,
                            role,
                            ticketName: currentTicketName,
                            mandays: tempMandayCount,
                            order: personOrders[person]++
                        });
                    }
                    currentTicketName = cellValue;
                    tempMandayCount = 1;
                }
            } else {
                if (currentTicketName) {
                    state.tickets.push({
                        id: `ticket_${state.tickets.length}`,
                        person,
                        role,
                        ticketName: currentTicketName,
                        mandays: tempMandayCount,
                        order: personOrders[person]++
                    });
                    currentTicketName = null;
                    tempMandayCount = 0;
                }
            }
        }
        
        if (currentTicketName) {
            state.tickets.push({
                id: `ticket_${state.tickets.length}`,
                person,
                role,
                ticketName: currentTicketName,
                mandays: tempMandayCount,
                order: personOrders[person]++
            });
        }
    });

    if (state.tickets.length > 0) {
        showTimeline();
    }
}

function showTimeline() {
    elements.exportBtn.disabled = false;
    elements.timelinePlaceholder.classList.add('hidden');
    elements.timelineView.classList.remove('hidden');
    elements.bottomPanels.classList.remove('hidden');
    updateDates(); // recalculates days, timeline, and renders
}

function calculateTimeline() {
    const byPerson = {};
    state.tickets.forEach(t => {
        if (!byPerson[t.person]) byPerson[t.person] = [];
        byPerson[t.person].push(t);
    });

    Object.keys(byPerson).forEach(person => {
        byPerson[person].sort((a, b) => a.order - b.order);
        
        let currentDayIdx = 0;
        
        byPerson[person].forEach(ticket => {
            if (currentDayIdx >= state.workingDays.length) {
                ticket.computedStartIdx = null;
                ticket.computedEndIdx = null;
                return;
            }

            ticket.computedStartIdx = currentDayIdx;
            
            let endIdx = currentDayIdx + ticket.mandays - 1;
            if (endIdx >= state.workingDays.length) {
                endIdx = state.workingDays.length - 1;
            }

            ticket.computedEndIdx = endIdx;
            currentDayIdx = endIdx + 1;
        });
    });
}

function renderTimeline() {
    const grid = elements.timelineGrid;
    grid.innerHTML = '';
    
    if (state.workingDays.length === 0) {
        grid.innerHTML = '<div style="padding: 2rem;">No working dates in selected range.</div>';
        return;
    }

    grid.style.gridTemplateColumns = `140px repeat(${state.workingDays.length}, minmax(40px, 1fr))`;

    // 1. Render Header
    const corner = document.createElement('div');
    corner.className = 'tl-corner-cell';
    grid.appendChild(corner);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    state.workingDays.forEach(day => {
        const cell = document.createElement('div');
        cell.className = 'tl-header-cell';
        cell.innerHTML = `${day.dateObj.getDate()} ${monthNames[day.dateObj.getMonth()]}`;
        grid.appendChild(cell);
    });

    // 2. Render Rows per Person
    const peopleMap = new Map();
    state.tickets.forEach(t => {
        if (!peopleMap.has(t.person)) {
            peopleMap.set(t.person, t.role);
        }
    });
    const people = Array.from(peopleMap.keys()).sort();
    
    people.forEach((person, personIdx) => {
        const rowNum = personIdx + 2; 

        // Person Name & Role Cell
        const nameCell = document.createElement('div');
        nameCell.className = 'tl-person-cell';
        nameCell.style.gridRow = rowNum;
        nameCell.style.gridColumn = 1;
        nameCell.innerHTML = `
            <div class="tl-person-info">
                <span>${person}</span>
                <span class="tl-person-role">${peopleMap.get(person)}</span>
            </div>
        `;
        grid.appendChild(nameCell);

        // Track
        const track = document.createElement('div');
        track.className = 'tl-track';
        track.style.gridRow = rowNum;
        track.style.gridColumn = `2 / -1`;
        track.style.gridTemplateColumns = `repeat(${state.workingDays.length}, 1fr)`;
        track.dataset.person = person;

        grid.appendChild(track);

        // Tickets
        const personTickets = state.tickets.filter(t => t.person === person).sort((a, b) => a.order - b.order);
        
        personTickets.forEach((ticket, tIdx) => {
            if (ticket.computedStartIdx === null) return; 

            const ticketEl = document.createElement('div');
            ticketEl.className = 'tl-ticket';
            ticketEl.dataset.id = ticket.id;
            
            const color = TICKET_COLORS[tIdx % TICKET_COLORS.length];
            ticketEl.style.backgroundColor = color;

            const span = ticket.computedEndIdx - ticket.computedStartIdx + 1;
            ticketEl.style.gridColumn = `${ticket.computedStartIdx + 1} / span ${span}`;
            ticketEl.style.gridRow = 1;

            ticketEl.innerHTML = `
                <div class="tl-ticket-title" title="${ticket.ticketName}">${ticket.ticketName}</div>
                <div class="tl-ticket-mandays">${ticket.mandays} days</div>
                <div class="tl-resize-controls">
                    <button class="tl-btn-icon" data-action="decrease" data-id="${ticket.id}">-</button>
                    <button class="tl-btn-icon" data-action="increase" data-id="${ticket.id}">+</button>
                </div>
            `;
            
            track.appendChild(ticketEl);
        });

        new Sortable(track, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: function(evt) {
                const ticketElements = Array.from(track.querySelectorAll('.tl-ticket'));
                const pTickets = state.tickets.filter(t => t.person === person);
                
                ticketElements.forEach((el, index) => {
                    const ticketId = el.dataset.id;
                    const ticket = pTickets.find(t => t.id === ticketId);
                    if (ticket) ticket.order = index;
                });
                
                calculateTimeline();
                renderTimeline();
                renderBottomPanels();
            }
        });
    });

    document.querySelectorAll('.tl-resize-controls button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.dataset.id;
            const action = e.target.dataset.action;
            const ticket = state.tickets.find(t => t.id === id);
            
            if (ticket) {
                if (action === 'increase') {
                    ticket.mandays += 1;
                } else if (action === 'decrease' && ticket.mandays > 1) {
                    ticket.mandays -= 1;
                }
                calculateTimeline();
                renderTimeline();
                renderBottomPanels();
            }
        });
    });

    renderBottomPanels();
}

function renderBottomPanels() {
    // Sprint Summary
    const summary = {};
    let totalSprintMandays = 0;
    
    state.tickets.forEach(t => {
        if (!summary[t.person]) summary[t.person] = 0;
        summary[t.person] += t.mandays;
        totalSprintMandays += t.mandays;
    });

    let summaryHtml = '';
    const people = Object.keys(summary).sort();
    people.forEach(person => {
        summaryHtml += `<div class="summary-item"><span>${person}</span><span>${summary[person]} days</span></div>`;
    });
    summaryHtml += `<div class="summary-total"><span>Total Sprint Output</span><span>${totalSprintMandays} days</span></div>`;
    
    elements.summaryContent.innerHTML = summaryHtml || '<p class="helper-text">No data.</p>';

    // Holiday Legend
    let legendHtml = '';
    if (state.skippedHolidays.length === 0) {
        legendHtml = '<p class="helper-text">No public holidays in current sprint.</p>';
    } else {
        state.skippedHolidays.forEach(h => {
            legendHtml += `<div class="legend-item"><span>${formatDate(h.dateObj)}</span><span>${h.holidayDesc}</span></div>`;
        });
    }
    elements.legendContent.innerHTML = legendHtml;
}

async function handleExport() {
    if (state.tickets.length === 0 || state.workingDays.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Timeline');

    // 1. Setup Columns and Header
    const columns = [
        { header: 'Assignee', key: 'assignee', width: 20 },
        { header: 'Role', key: 'role', width: 15 }
    ];
    
    state.workingDays.forEach(day => {
        columns.push({ 
            header: formatDate(day.dateObj), 
            key: formatDate(day.dateObj), 
            width: 15 
        });
    });
    
    worksheet.columns = columns;

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // 2. Add Data Rows
    const peopleMap = new Map();
    state.tickets.forEach(t => {
        if (!peopleMap.has(t.person)) peopleMap.set(t.person, t.role);
    });
    const people = Array.from(peopleMap.keys()).sort();
    
    people.forEach(person => {
        const role = peopleMap.get(person);
        const rowData = { assignee: person, role: role };
        const personTickets = state.tickets.filter(t => t.person === person).sort((a, b) => a.order - b.order);
        
        personTickets.forEach((ticket, tIdx) => {
            if (ticket.computedStartIdx !== null) {
                for (let i = ticket.computedStartIdx; i <= ticket.computedEndIdx; i++) {
                    if (i < state.workingDays.length) {
                        const dayKey = formatDate(state.workingDays[i].dateObj);
                        rowData[dayKey] = ticket.ticketName;
                    }
                }
            }
        });

        const row = worksheet.addRow(rowData);
        
        // Style Person/Role Cells
        row.getCell('assignee').font = { bold: true };
        row.getCell('assignee').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        row.getCell('role').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

        personTickets.forEach((ticket, tIdx) => {
            if (ticket.computedStartIdx !== null) {
                let colorHex = TICKET_COLORS[tIdx % TICKET_COLORS.length].replace('#', '');
                let argbColor = 'FF' + colorHex.toUpperCase();

                for (let i = ticket.computedStartIdx; i <= ticket.computedEndIdx; i++) {
                    if (i < state.workingDays.length) {
                        const dayKey = formatDate(state.workingDays[i].dateObj);
                        const cell = row.getCell(dayKey);
                        
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor } };
                        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        cell.border = {
                            top: {style:'thin', color: {argb:'FFFFFFFF'}},
                            left: {style:'thin', color: {argb:'FFFFFFFF'}},
                            bottom: {style:'thin', color: {argb:'FFFFFFFF'}},
                            right: {style:'thin', color: {argb:'FFFFFFFF'}}
                        };
                    }
                }
            }
        });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, "Sprint_Timeline.xlsx");
}

init();
