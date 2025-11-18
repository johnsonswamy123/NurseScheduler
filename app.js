// Nurse Duty Scheduler with Roles, Login, Calendar & Approvals (demo-only)
// All data is stored in localStorage (not secure for real production)

const STORAGE_KEY = "nurseDutyScheduler_v2";

let state = {
  nurses: [],   // { id, name, dob, gender, experience, bloodGroup, speciality, role, username, password }
  duties: [],   // { id, date, nurseId, shift }
  requests: [], // { id, type, forNurseId, createdByNurseId, fromDate, toDate, remarks, status, approverRole }
  currentUserId: null
};

// --- ROLE HIERARCHY ---

const ROLE_RANK = {
  "Staff Nurse": 1,
  "Nurse Incharge": 2,
  "Nurse Supervisor": 3,
  "Nursing Superintendent": 4
};

function getRoleRank(role) {
  return ROLE_RANK[role] || 0;
}

// Next approver for a given nurse role (for leave/shift-change)
function getNextApproverRoleForRole(role) {
  if (role === "Staff Nurse") return "Nurse Incharge";
  if (role === "Nurse Incharge") return "Nurse Supervisor";
  if (role === "Nurse Supervisor") return "Nursing Superintendent";
  return null; // Nursing Superintendent has no higher approver
}

// Deletion requests always go to Nursing Superintendent
const DELETE_APPROVER_ROLE = "Nursing Superintendent";

// --- LOCAL STORAGE ---

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading localStorage:", err);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function generateId(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

function getCurrentUser() {
  return state.nurses.find((n) => n.id === state.currentUserId) || null;
}

// --- DOM ELEMENTS ---

// Login
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const currentUserPanel = document.getElementById("current-user-panel");
const currentUserInfoDiv = document.getElementById("current-user-info");
const logoutBtn = document.getElementById("logout-btn");

// Nurse master
const nurseForm = document.getElementById("nurse-form");
const nurseNameInput = document.getElementById("nurse-name");
const nurseDobInput = document.getElementById("nurse-dob");
const nurseGenderSelect = document.getElementById("nurse-gender");
const nurseExperienceInput = document.getElementById("nurse-experience");
const nurseBloodGroupSelect = document.getElementById("nurse-blood-group");
const nurseSpecialitySelect = document.getElementById("nurse-speciality");
const nurseRoleSelect = document.getElementById("nurse-role");
const nurseUsernameInput = document.getElementById("nurse-username");
const nursePasswordInput = document.getElementById("nurse-password");
const nurseTableBody = document.querySelector("#nurse-table tbody");

// Duty form
const dutyForm = document.getElementById("duty-form");
const dutyDateInput = document.getElementById("duty-date");
const dutyNurseSelect = document.getElementById("duty-nurse");
const dutyShiftSelect = document.getElementById("duty-shift");

// Filters
const filterNurseSelect = document.getElementById("filter-nurse");
const filterFromInput = document.getElementById("filter-from");
const filterToInput = document.getElementById("filter-to");
const filterShiftSelect = document.getElementById("filter-shift");
const clearFiltersBtn = document.getElementById("clear-filters");

// Roster list view
const scheduleTableBody = document.querySelector("#schedule-table tbody");

// Export / Clear all
const exportCsvBtn = document.getElementById("export-csv");
const clearAllBtn = document.getElementById("clear-all");

// Calendar
const calendarMonthLabel = document.getElementById("calendar-month-label");
const calendarGrid = document.getElementById("calendar-grid");
const calendarPrevBtn = document.getElementById("calendar-prev");
const calendarNextBtn = document.getElementById("calendar-next");

// Requests
const requestForm = document.getElementById("request-form");
const requestTypeSelect = document.getElementById("request-type");
const requestFromInput = document.getElementById("request-from");
const requestToInput = document.getElementById("request-to");
const requestRemarksInput = document.getElementById("request-remarks");
const requestsTableBody = document.querySelector("#requests-table tbody");

// Calendar state
const today = new Date();
let calendarYear = today.getFullYear();
let calendarMonth = today.getMonth(); // 0-11

// --- RENDER HELPERS ---

function renderCurrentUser() {
  const user = getCurrentUser();
  if (!user) {
    currentUserInfoDiv.innerHTML = `<p>No user logged in.</p>`;
    logoutBtn.style.display = "none";
    document.body.classList.remove("logged-in");
    return;
  }

  currentUserInfoDiv.innerHTML = `
    <p><strong>${user.name}</strong></p>
    <p>Role: ${user.role}</p>
    <p>Ward: ${user.speciality}</p>
    <p>Username: ${user.username}</p>
  `;
  logoutBtn.style.display = "inline-block";
  document.body.classList.add("logged-in");
}

function renderNurseOptions() {
  dutyNurseSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select nurse";
  dutyNurseSelect.appendChild(placeholder);

  filterNurseSelect.innerHTML = "";
  const filterAll = document.createElement("option");
  filterAll.value = "";
  filterAll.textContent = "All nurses";
  filterNurseSelect.appendChild(filterAll);

  state.nurses.forEach((nurse) => {
    const opt = document.createElement("option");
    opt.value = nurse.id;
    opt.textContent = `${nurse.name} (${nurse.role})`;
    dutyNurseSelect.appendChild(opt);

    const opt2 = document.createElement("option");
    opt2.value = nurse.id;
    opt2.textContent = `${nurse.name} (${nurse.role})`;
    filterNurseSelect.appendChild(opt2);
  });
}

function renderNurseTable() {
  nurseTableBody.innerHTML = "";

  if (state.nurses.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No nurses added yet.";
    tr.appendChild(td);
    nurseTableBody.appendChild(tr);
    return;
  }

  const currentUser = getCurrentUser();

  state.nurses.forEach((nurse) => {
    const tr = document.createElement("tr");
    const canRequestDelete =
      currentUser &&
      getRoleRank(currentUser.role) > getRoleRank(nurse.role);

    tr.innerHTML = `
      <td>${nurse.name}</td>
      <td>${nurse.role}</td>
      <td>${nurse.speciality}</td>
      <td>${nurse.experience}</td>
      <td>
        ${
          canRequestDelete
            ? `<button class="danger small" data-action="request-delete-nurse" data-id="${nurse.id}">
                 Request Delete
               </button>`
            : `<span class="note">No rights</span>`
        }
      </td>
    `;
    nurseTableBody.appendChild(tr);
  });
}

function renderScheduleTable() {
  scheduleTableBody.innerHTML = "";

  const filterNurseId = filterNurseSelect.value;
  const fromDate = filterFromInput.value || null;
  const toDate = filterToInput.value || null;
  const filterShift = filterShiftSelect.value;

  const dutiesSorted = [...state.duties].sort((a, b) => a.date.localeCompare(b.date));

  const filtered = dutiesSorted.filter((duty) => {
    if (filterNurseId && duty.nurseId !== filterNurseId) return false;
    if (fromDate && duty.date < fromDate) return false;
    if (toDate && duty.date > toDate) return false;
    if (filterShift && duty.shift !== filterShift) return false;
    return true;
  });

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No duties found for the selected filters.";
    tr.appendChild(td);
    scheduleTableBody.appendChild(tr);
    return;
  }

  filtered.forEach((duty) => {
    const nurse = state.nurses.find((n) => n.id === duty.nurseId);
    const nurseName = nurse ? nurse.name : "Unknown";
    const nurseRole = nurse ? nurse.role : "-";
    const nurseWard = nurse ? nurse.speciality : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${duty.date}</td>
      <td>${nurseName}</td>
      <td>${nurseRole}</td>
      <td>${nurseWard}</td>
      <td>${duty.shift}</td>
      <td>
        <button class="danger small" data-action="delete-duty" data-id="${duty.id}">
          Delete
        </button>
      </td>
    `;
    scheduleTableBody.appendChild(tr);
  });
}

// --- CALENDAR ---

function getShiftAbbrev(shift) {
  switch (shift) {
    case "Morning": return "M";
    case "Evening": return "E";
    case "Night": return "N";
    case "Off": return "Off";
    default: return shift;
  }
}

function renderCalendar() {
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  calendarMonthLabel.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

  calendarGrid.innerHTML = "";

  const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const jsDay = firstOfMonth.getDay(); // 0-6 (Sun-Sat)
  const startIndex = (jsDay + 6) % 7;  // Monday = 0

  const filterNurseId = filterNurseSelect.value;
  const filterShift = filterShiftSelect.value;

  const totalCells = startIndex + daysInMonth;
  const cellsToRender = Math.ceil(totalCells / 7) * 7;

  const todayStr = today.toISOString().slice(0, 10);

  for (let cellIndex = 0; cellIndex < cellsToRender; cellIndex++) {
    const cell = document.createElement("div");

    if (cellIndex < startIndex || cellIndex >= startIndex + daysInMonth) {
      cell.className = "calendar-cell empty";
      calendarGrid.appendChild(cell);
      continue;
    }

    const dayNumber = cellIndex - startIndex + 1;
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2,"0")}-${String(dayNumber).padStart(2,"0")}`;

    let dutiesForDay = state.duties.filter((d) => d.date === dateStr);
    if (filterNurseId) dutiesForDay = dutiesForDay.filter((d) => d.nurseId === filterNurseId);
    if (filterShift) dutiesForDay = dutiesForDay.filter((d) => d.shift === filterShift);

    const isToday = dateStr === todayStr;
    const hasDuties = dutiesForDay.length > 0;

    let cellClass = "calendar-cell";
    if (hasDuties) cellClass += " has-duties";
    if (isToday) cellClass += " today";
    cell.className = cellClass;

    const dateDiv = document.createElement("div");
    dateDiv.className = "calendar-date-number";
    dateDiv.textContent = dayNumber;
    cell.appendChild(dateDiv);

    const dutiesDiv = document.createElement("div");
    dutiesDiv.className = "calendar-duties";

    const maxLines = 3;
    const dutiesToShow = dutiesForDay.slice(0, maxLines);

    dutiesToShow.forEach((duty) => {
      const nurse = state.nurses.find((n) => n.id === duty.nurseId);
      const nurseName = nurse ? nurse.name : "Unknown";
      const shiftAbbrev = getShiftAbbrev(duty.shift);

      const dutyDiv = document.createElement("div");
      dutyDiv.className = "calendar-duty";
      dutyDiv.textContent = `${shiftAbbrev}: ${nurseName}`;
      dutiesDiv.appendChild(dutyDiv);
    });

    if (dutiesForDay.length > maxLines) {
      const extraDiv = document.createElement("div");
      extraDiv.className = "calendar-duty-more";
      extraDiv.textContent = `+${dutiesForDay.length - maxLines} more`;
      dutiesDiv.appendChild(extraDiv);
    }

    cell.appendChild(dutiesDiv);
    calendarGrid.appendChild(cell);
  }
}

// --- REQUESTS & APPROVALS ---

function renderRequestsTable() {
  requestsTableBody.innerHTML = "";
  const currentUser = getCurrentUser();
  if (!currentUser) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Login to see requests and approvals.";
    tr.appendChild(td);
    requestsTableBody.appendChild(tr);
    return;
  }

  const myId = currentUser.id;
  const myRole = currentUser.role;

  // Requests visible for approval if approverRole == myRole and status == pending
  // Also show requests created by me
  const visibleRequests = state.requests.filter((req) => {
    const isMyApproval = req.approverRole === myRole && req.status === "pending";
    const isMyOwn = req.createdByNurseId === myId;
    return isMyApproval || isMyOwn;
  });

  if (visibleRequests.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No requests for you currently.";
    tr.appendChild(td);
    requestsTableBody.appendChild(tr);
    return;
  }

  visibleRequests.forEach((req) => {
    const forNurse = state.nurses.find((n) => n.id === req.forNurseId);
    const forName = forNurse ? forNurse.name : "Unknown";

    const dateRange =
      req.fromDate || req.toDate
        ? `${req.fromDate || ""} – ${req.toDate || ""}`
        : "-";

    const canAct =
      req.status === "pending" &&
      req.approverRole === myRole &&
      // The approver should not be the requester themselves
      req.createdByNurseId !== myId;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${req.type}</td>
      <td>${forName}</td>
      <td>${dateRange}</td>
      <td>${req.status}${req.remarks ? " (" + req.remarks + ")" : ""}</td>
      <td>
        ${
          canAct
            ? `
          <button class="small" data-action="approve-request" data-id="${req.id}">
            Approve
          </button>
          <button class="danger small" data-action="reject-request" data-id="${req.id}">
            Reject
          </button>
        `
            : `<span class="note">No action</span>`
        }
      </td>
    `;
    requestsTableBody.appendChild(tr);
  });
}

// --- MAIN RENDER ---

function renderAll() {
  renderCurrentUser();
  renderNurseOptions();
  renderNurseTable();
  renderScheduleTable();
  renderCalendar();
  renderRequestsTable();
}

// --- EVENT HANDLERS ---

// LOGIN
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  const user = state.nurses.find(
    (n) => n.username === username && n.password === password
  );

  if (!user) {
    alert("Invalid username or password.");
    return;
  }

  state.currentUserId = user.id;
  saveState();
  loginPasswordInput.value = "";
  renderAll();
});

logoutBtn.addEventListener("click", () => {
  state.currentUserId = null;
  saveState();
  renderAll();
});

// ADD NURSE (with hierarchy check)
nurseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const currentUser = getCurrentUser();
  const name = nurseNameInput.value.trim();
  const dob = nurseDobInput.value;
  const gender = nurseGenderSelect.value;
  const experience = parseInt(nurseExperienceInput.value || "0", 10);
  const bloodGroup = nurseBloodGroupSelect.value;
  const speciality = nurseSpecialitySelect.value;
  const role = nurseRoleSelect.value;
  const username = nurseUsernameInput.value.trim();
  const password = nursePasswordInput.value;

  if (!name || !dob || !gender || !bloodGroup || !speciality || !role || !username || !password) {
    alert("Please fill all nurse fields.");
    return;
  }

  // Hierarchy rule: currentUser must exist and have rank >= role they are creating
  // For first nurse ever, allow creation without login
  if (state.nurses.length > 0) {
    if (!currentUser) {
      alert("Please login to add nurses (demo rule).");
      return;
    }
    if (getRoleRank(currentUser.role) < getRoleRank(role)) {
      alert("You cannot create a nurse with a higher role than yours.");
      return;
    }
  }

  if (state.nurses.some((n) => n.username === username)) {
    alert("Username already exists. Choose another.");
    return;
  }

  const newNurse = {
    id: generateId("nurse"),
    name,
    dob,
    gender,
    experience,
    bloodGroup,
    speciality,
    role,
    username,
    password
  };

  state.nurses.push(newNurse);
  saveState();

  nurseNameInput.value = "";
  nurseDobInput.value = "";
  nurseGenderSelect.value = "";
  nurseExperienceInput.value = "";
  nurseBloodGroupSelect.value = "";
  nurseSpecialitySelect.value = "";
  nurseRoleSelect.value = "";
  nurseUsernameInput.value = "";
  nursePasswordInput.value = "";

  renderAll();
});

// NURSE TABLE ACTIONS (request deletion)
nurseTableBody.addEventListener("click", (e) => {
  const btnDeleteReq = e.target.closest("button[data-action='request-delete-nurse']");
  if (btnDeleteReq) {
    const nurseId = btnDeleteReq.getAttribute("data-id");
    const target = state.nurses.find((n) => n.id === nurseId);
    const currentUser = getCurrentUser();
    if (!currentUser || !target) return;

    if (getRoleRank(currentUser.role) <= getRoleRank(target.role)) {
      alert("You can only request deletion of nurses below your role.");
      return;
    }

    const ok = confirm(
      `Request deletion of nurse ${target.name}? Final approval will be by Nursing Superintendent.`
    );
    if (!ok) return;

    const req = {
      id: generateId("req"),
      type: "delete-nurse",
      forNurseId: target.id,
      createdByNurseId: currentUser.id,
      fromDate: null,
      toDate: null,
      remarks: "Request to delete nurse",
      status: "pending",
      approverRole: DELETE_APPROVER_ROLE
    };

    state.requests.push(req);
    saveState();
    renderRequestsTable();
  }
});

// ADD / UPDATE DUTY
dutyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("Please login to assign duties.");
    return;
  }

  const date = dutyDateInput.value;
  const nurseId = dutyNurseSelect.value;
  const shift = dutyShiftSelect.value;

  if (!date || !nurseId || !shift) {
    alert("Please fill all fields (date, nurse, shift).");
    return;
  }

  const existing = state.duties.find(
    (d) => d.date === date && d.nurseId === nurseId
  );

  if (existing) {
    existing.shift = shift;
  } else {
    state.duties.push({
      id: generateId("duty"),
      date,
      nurseId,
      shift
    });
  }

  saveState();
  renderScheduleTable();
  renderCalendar();
  dutyShiftSelect.value = "";
});

// DELETE DUTY
scheduleTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action='delete-duty']");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  state.duties = state.duties.filter((d) => d.id !== id);
  saveState();
  renderScheduleTable();
  renderCalendar();
});

// FILTERS
function onFilterChange() {
  renderScheduleTable();
  renderCalendar();
}

filterNurseSelect.addEventListener("change", onFilterChange);
filterFromInput.addEventListener("change", onFilterChange);
filterToInput.addEventListener("change", onFilterChange);
filterShiftSelect.addEventListener("change", onFilterChange);

clearFiltersBtn.addEventListener("click", () => {
  filterNurseSelect.value = "";
  filterFromInput.value = "";
  filterToInput.value = "";
  filterShiftSelect.value = "";
  renderScheduleTable();
  renderCalendar();
});

// EXPORT CSV
exportCsvBtn.addEventListener("click", () => {
  if (state.duties.length === 0) {
    alert("No duties to export.");
    return;
  }

  const header = ["Date", "Nurse", "Role", "Ward", "Shift"];
  const rows = [header];

  const sorted = [...state.duties].sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach((duty) => {
    const nurse = state.nurses.find((n) => n.id === duty.nurseId);
    const nurseName = nurse ? nurse.name : "Unknown";
    const nurseRole = nurse ? nurse.role || "" : "";
    const nurseWard = nurse ? nurse.speciality || "" : "";

    rows.push([duty.date, nurseName, nurseRole, nurseWard, duty.shift]);
  });

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "nurse_duty_roster.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
});

// CLEAR ALL DATA
clearAllBtn.addEventListener("click", () => {
  const ok = confirm(
    "This will delete all nurses, duties, and requests from THIS browser. Continue?"
  );
  if (!ok) return;
  state = { nurses: [], duties: [], requests: [], currentUserId: null };
  saveState();
  renderAll();
});

// NEW REQUEST (leave / shift-change)
requestForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("Please login to raise a request.");
    return;
  }

  const type = requestTypeSelect.value;
  const fromDate = requestFromInput.value || null;
  const toDate = requestToInput.value || null;
  const remarks = requestRemarksInput.value.trim();

  if (!type) {
    alert("Select request type.");
    return;
  }

  // For simplicity, we use currentUser as the nurse for whom the request is raised
  const targetRole = currentUser.role;
  const approverRole = getNextApproverRoleForRole(targetRole);
  if (!approverRole) {
    alert("No higher approver role available for this user.");
    return;
  }

  const req = {
    id: generateId("req"),
    type,
    forNurseId: currentUser.id,
    createdByNurseId: currentUser.id,
    fromDate,
    toDate,
    remarks,
    status: "pending",
    approverRole
  };

  state.requests.push(req);
  saveState();

  requestTypeSelect.value = "";
  requestFromInput.value = "";
  requestToInput.value = "";
  requestRemarksInput.value = "";

  renderRequestsTable();
  alert("Request submitted.");
});

// APPROVE / REJECT REQUEST
requestsTableBody.addEventListener("click", (e) => {
  const btnApprove = e.target.closest("button[data-action='approve-request']");
  const btnReject = e.target.closest("button[data-action='reject-request']");
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  if (btnApprove || btnReject) {
    const id = (btnApprove || btnReject).getAttribute("data-id");
    const req = state.requests.find((r) => r.id === id);
    if (!req || req.status !== "pending") return;

    const approve = !!btnApprove;

    if (approve) {
      req.status = "approved";
      req.remarks = req.remarks || "";
      req.remarks += ` [Approved by ${currentUser.role}]`;

      // If this is delete-nurse and approverRole is Nursing Superintendent, actually delete
      if (req.type === "delete-nurse" && req.approverRole === DELETE_APPROVER_ROLE) {
        state.nurses = state.nurses.filter((n) => n.id !== req.forNurseId);
        state.duties = state.duties.filter((d) => d.nurseId !== req.forNurseId);
      }
    } else {
      req.status = "rejected";
      req.remarks = req.remarks || "";
      req.remarks += ` [Rejected by ${currentUser.role}]`;
    }

    saveState();
    renderAll();
  }
});

// CALENDAR NAVIGATION
calendarPrevBtn.addEventListener("click", () => {
  calendarMonth -= 1;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear -= 1;
  }
  renderCalendar();
});

calendarNextBtn.addEventListener("click", () => {
  calendarMonth += 1;
  if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear += 1;
  }
  renderCalendar();
});

// --- INIT ---

loadState();
renderAll();

if (dutyDateInput) {
  dutyDateInput.value = today.toISOString().slice(0, 10);
}
