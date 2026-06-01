// ==========================================
// MOCK DATABASE & LOCALSTORAGE INITIALIZATION
// ==========================================

const DEFAULT_DATA = {
    users: [
        { id: "admin", password: "admin123", role: "admin", name: "System Admin" },
        { id: "teacher1", password: "teacher123", role: "teacher", name: "Dr. Sarah Ahmed", courseId: "CS101", courseName: "Computer Science" },
        { id: "student1", password: "student123", role: "student", name: "Isaac Mohamed" }
    ],
    students: [
        { id: "student1", name: "Isaac Mohamed" }
    ],
    // Tracks grading metrics across 9 semesters for testing
    grades: [
        // Semester 1 to 3 preloaded data to see immediate GPA functionality
        { studentId: "student1", courseId: "MATH101", courseName: "Calculus I", semester: 1, attendance: 10, assignment: 18, midExam: 17, finalExam: 45 },
        { studentId: "student1", courseId: "ENG101", courseName: "English Composition", semester: 1, attendance: 9, assignment: 19, midExam: 15, finalExam: 42 },
        { studentId: "student1", courseId: "CS101", courseName: "Computer Science", semester: 2, attendance: 10, assignment: 20, midExam: 19, finalExam: 48 },
        { studentId: "student1", courseId: "PHY101", courseName: "Physics I", semester: 3, attendance: 8, assignment: 14, midExam: 16, finalExam: 38 }
    ],
    // Tracks structural everyday attendance log instances
    attendanceLogs: [
        { date: "2026-05-28", courseId: "CS101", studentId: "student1", status: "Present", semester: 2 },
        { date: "2026-05-29", courseId: "CS101", studentId: "student1", status: "Absent", semester: 2 }
    ]
};

// DATABASE ACCESSIBILITY WRAPPERS (Swap these out when integrating backend databases)
function getDB() {
    if (!localStorage.getItem('sms_db')) {
        localStorage.setItem('sms_db', JSON.stringify(DEFAULT_DATA));
    }
    return JSON.parse(localStorage.getItem('sms_db'));
}

function saveDB(data) {
    localStorage.setItem('sms_db', JSON.stringify(data));
}

// Global state tracking runtime authenticated user
let currentUser = null;
let currentAttendanceState = {}; // Temporary memory state for active attendance collection

// ==========================================
// AUTHENTICATION ENGINE
// ==========================================
document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const idInput = document.getElementById('username').value.trim();
    const passInput = document.getElementById('password').value;
    const errorDisplay = document.getElementById('login-error');

    const db = getDB();
    const user = db.users.find(u => u.id === idInput && u.password === passInput);

    if (user) {
        currentUser = user;
        errorDisplay.textContent = "";
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        setupDashboardView();
    } else {
        errorDisplay.textContent = "Invalid User ID or Password.";
    }
});

document.getElementById('logout-btn').addEventListener('click', function() {
    currentUser = null;
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
});

// ==========================================
// VIEW ROUTING CONTROLLER
// ==========================================
function setupDashboardView() {
    // Hide all dashboard modules initially
    document.querySelectorAll('.dashboard-view').forEach(view => view.classList.add('hidden'));
    
    document.getElementById('welcome-text').textContent = `Welcome, ${currentUser.name}`;
    document.getElementById('user-role-badge').textContent = currentUser.role;

    if (currentUser.role === 'admin') {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        initAdminViews(); // Call newly added admin function
    } else if (currentUser.role === 'teacher') {
        document.getElementById('teacher-dashboard').classList.remove('hidden');
        document.getElementById('teacher-course-name').textContent = currentUser.courseName;
        initTeacherViews();
    } else if (currentUser.role === 'student') {
        document.getElementById('student-dashboard').classList.remove('hidden');
        initStudentViews();
    }
}

// ==========================================
// TEACHER CONTROLLER: ATTENDANCE & GRADES
// ==========================================
function switchTeacherTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

function initTeacherViews() {
    const db = getDB();
    const attendanceTableBody = document.getElementById('attendance-table-body');
    const gradesTableBody = document.getElementById('grades-table-body');
    
    // NEW: Get the currently selected semester from the teacher workspace dropdown
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;
    
    // Set default date picker to current local computer date
    document.getElementById('attendance-date').value = new Date().toISOString().split('T')[0];

    // Clear old data references
    attendanceTableBody.innerHTML = '';
    gradesTableBody.innerHTML = '';
    currentAttendanceState = {};

    db.students.forEach(student => {
        // Initialize active attendance default to "Present"
        currentAttendanceState[student.id] = 'Present';

        // 1. Build Attendance UI Table Row
        const attendanceRow = document.createElement('tr');
        attendanceRow.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>
                <button type="button" class="btn btn-toggle active-present" id="p-${student.id}" onclick="setAttendanceStatus('${student.id}', 'Present')">Present</button>
                <button type="button" class="btn btn-toggle" id="a-${student.id}" onclick="setAttendanceStatus('${student.id}', 'Absent')">Absent</button>
            </td>
        `;
        attendanceTableBody.appendChild(attendanceRow);

        // 2. Build Grade Management UI Table Row (NEW: Now matches both course ID AND selected semester)
        const exactGrade = db.grades.find(g => g.studentId === student.id && g.courseId === currentUser.courseId && g.semester === selectedSemester) || {
            attendance: 0, assignment: 0, midExam: 0, finalExam: 0
        };

        const totalScore = calculateRowTotal(exactGrade);

        const gradeRow = document.createElement('tr');
        gradeRow.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td><input type="number" min="0" max="10" value="${exactGrade.attendance}" class="grade-input" data-sid="${student.id}" data-field="attendance" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="20" value="${exactGrade.assignment}" class="grade-input" data-sid="${student.id}" data-field="assignment" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="20" value="${exactGrade.midExam}" class="grade-input" data-sid="${student.id}" data-field="midExam" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="50" value="${exactGrade.finalExam}" class="grade-input" data-sid="${student.id}" data-field="finalExam" oninput="updateGradeTotalDisplay(this)"></td>
            <td><strong id="total-${student.id}">${totalScore}</strong>/100</td>
        `;
        gradesTableBody.appendChild(gradeRow);
    });
}

function setAttendanceStatus(studentId, status) {
    currentAttendanceState[studentId] = status;
    const presentBtn = document.getElementById(`p-${studentId}`);
    const absentBtn = document.getElementById(`a-${studentId}`);

    if (status === 'Present') {
        presentBtn.classList.add('active-present');
        absentBtn.classList.remove('active-absent');
    } else {
        absentBtn.classList.add('active-absent');
        presentBtn.classList.remove('active-present');
    }
}

function calculateRowTotal(gradeObj) {
    return (Number(gradeObj.attendance) || 0) + 
           (Number(gradeObj.assignment) || 0) + 
           (Number(gradeObj.midExam) || 0) + 
           (Number(gradeObj.finalExam) || 0);
}

function updateGradeTotalDisplay(inputElement) {
    const studentId = inputElement.getAttribute('data-sid');
    const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
    let total = 0;
    rowInputs.forEach(input => {
        total += Number(input.value) || 0;
    });
    document.getElementById(`total-${studentId}`).textContent = total;
}

// Save Attendance Event
document.getElementById('save-attendance-btn').addEventListener('click', function() {
    const db = getDB();
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;

    if (!dateSelected) {
        alert("Please pick a valid calendar tracking date.");
        return;
    }

    // Filter out old records matches for same date/course if rewriting history
    db.attendanceLogs = db.attendanceLogs.filter(log => !(log.date === dateSelected && log.courseId === currentUser.courseId));

    // Save current sheet configuration state items
    for (let studentId in currentAttendanceState) {
        db.attendanceLogs.push({
            date: dateSelected,
            courseId: currentUser.courseId,
            studentId: studentId,
            status: currentAttendanceState[studentId],
            semester: selectedSemester // Added semester context to tracking records
        });
    }

    saveDB(db);
    alert(`Attendance successfully stored for ${dateSelected}!`);
});

// Save Grades Event
document.getElementById('save-grades-btn').addEventListener('click', function() {
    const db = getDB();
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;
    
    db.students.forEach(student => {
        const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${student.id}"]`);
        
        // NEW: Find existing grade record specific to the active course and workspace semester selection
        let gradeRecord = db.grades.find(g => g.studentId === student.id && g.courseId === currentUser.courseId && g.semester === selectedSemester);

        if (!gradeRecord) {
            gradeRecord = { 
                studentId: student.id, 
                courseId: currentUser.courseId, 
                courseName: currentUser.courseName,
                semester: selectedSemester // Now records with the selectable semester value
            };
            db.grades.push(gradeRecord);
        }

        rowInputs.forEach(input => {
            const field = input.getAttribute('data-field');
            gradeRecord[field] = Number(input.value) || 0;
        });
    });

    saveDB(db);
    alert("Course marks and grades securely saved!");
});

// ==========================================
// STUDENT CONTROLLER: GPA & RECORDS
// ==========================================
function initStudentViews() {
    const db = getDB();
    const studentReportBody = document.getElementById('student-report-body');
    studentReportBody.innerHTML = '';

    // Filter down to records only mapping to current logged-in identity
    const studentGrades = db.grades.filter(g => g.studentId === currentUser.id);
    const studentLogs = db.attendanceLogs.filter(l => l.studentId === currentUser.id);

    let totalPointsAcrossSemesters = 0;
    let totalCoursesCount = 0;

    // Loop logic generating display matrices matching system performance requirements across all semesters
    studentGrades.forEach(grade => {
        const totalScore = calculateRowTotal(grade);
        
        // Match attendance logs by course and matching semester to prevent cross-contamination
        const courseAttendanceLogs = studentLogs.filter(l => l.courseId === grade.courseId && (!l.semester || l.semester === grade.semester));
        
        const totalP = courseAttendanceLogs.filter(l => l.status === 'Present').length;
        const totalA = courseAttendanceLogs.filter(l => l.status === 'Absent').length;

        // Map standard 100 percent grades points down to classic universal 4.0 GPA scales
        const gpaPoints = calculateGPAValue(totalScore);
        totalPointsAcrossSemesters += gpaPoints;
        totalCoursesCount++;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Semester ${grade.semester}</td>
            <td><strong>${grade.courseName}</strong></td>
            <td>${grade.attendance} / 10</td>
            <td>${grade.assignment} / 20</td>
            <td>${grade.midExam} / 20</td>
            <td>${grade.finalExam} / 50</td>
            <td><strong>${totalScore}</strong> (${gpaPoints.toFixed(2)} GP)</td>
            <td><span style="color:green;">P: ${totalP}</span> | <span style="color:red;">A: ${totalA}</span></td>
        `;
        studentReportBody.appendChild(tr);
    });

    // Handle Cumulative GPA Render calculation metrics safely across existing semesters
    const cumulativeGPA = totalCoursesCount > 0 ? (totalPointsAcrossSemesters / totalCoursesCount) : 0.00;
    document.getElementById('student-cgpa').textContent = cumulativeGPA.toFixed(2);
}

// Helper calculation determining conversion weights metrics scales
function calculateGPAValue(score) {
    if (score >= 90) return 4.00;
    if (score >= 80) return 3.50;
    if (score >= 70) return 3.00;
    if (score >= 60) return 2.50;
    if (score >= 50) return 2.00;
    return 0.00;
}

// ==========================================
// ADMIN ENGINE CONTROLS & AUTHORITY PORTAL
// ==========================================
document.getElementById('reset-db-btn').addEventListener('click', function() {
    if (confirm("Are you sure you want to reset the database back to default demo records?")) {
        localStorage.removeItem('sms_db');
        alert("Database successfully reset.");
        location.reload();
    }
});

// NEW: Initialize full admin configuration capabilities view
function initAdminViews() {
    const db = getDB();
    const adminUsersTableBody = document.getElementById('admin-users-table-body');
    adminUsersTableBody.innerHTML = '';

    db.users.forEach(user => {
        const tr = document.createElement('tr');
        const courseDetails = user.role === 'teacher' ? `${user.courseName} (${user.courseId})` : '-';
        
        // Prevent admin from deleting themselves out of the platform workspace session
        const deleteBtn = user.id === currentUser.id 
            ? `<small style="color: gray; font-style: italic;">Active Session</small>` 
            : `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteUser('${user.id}')">Delete</button>`;

        tr.innerHTML = `
            <td><strong>${user.id}</strong></td>
            <td>${user.name}</td>
            <td><span class="badge" style="background:${user.role==='admin'?'#fef3c7':user.role==='teacher'?'#dcfce7':'#dbeafe'}; color:${user.role==='admin'?'#92400e':user.role==='teacher'?'#166534':'#1e40af'};">${user.role}</span></td>
            <td>${courseDetails}</td>
            <td>${deleteBtn}</td>
        `;
        adminUsersTableBody.appendChild(tr);
    });
}

// NEW: Show/Hide course entry input inputs dynamically during teacher account setup
function toggleAdminCourseFields() {
    const roleSelected = document.getElementById('new-user-role').value;
    const courseFields = document.getElementById('admin-course-fields');
    if (roleSelected === 'teacher') {
        courseFields.classList.remove('hidden');
    } else {
        courseFields.classList.add('hidden');
    }
}

// NEW: Create User operation implementation handling authority assignments
document.getElementById('admin-add-user-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const db = getDB();
    const id = document.getElementById('new-user-id').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    if (db.users.some(u => u.id === id)) {
        alert("A user with this matching identification key already exists!");
        return;
    }

    const newUser = { id, password, role, name };

    if (role === 'teacher') {
        newUser.courseId = document.getElementById('new-user-cid').value.trim() || "GEN101";
        newUser.courseName = document.getElementById('new-user-cname').value.trim() || "General Course";
    }

    db.users.push(newUser);

    // If role is student, push into students tracking matrix registry so they can be graded by teachers
    if (role === 'student') {
        db.students.push({ id, name });
    }

    saveDB(db);
    initAdminViews();
    
    document.getElementById('admin-add-user-form').reset();
    toggleAdminCourseFields();
    alert(`Account for ${name} successfully initialized!`);
});

// NEW: Delete User control handling full platform cleanup
function deleteUser(userId) {
    if (confirm(`Are you sure you want to permanently delete user [${userId}]?`)) {
        let db = getDB();
        
        db.users = db.users.filter(u => u.id !== userId);
        db.students = db.students.filter(s => s.id !== userId);
        
        saveDB(db);
        initAdminViews();
        alert("User completely removed from system database storage.");
    }
}

// Attach new admin functions to global window scope context for inline html binding
window.toggleAdminCourseFields = toggleAdminCourseFields;
window.deleteUser = deleteUser;