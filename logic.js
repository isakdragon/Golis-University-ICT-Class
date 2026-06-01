// ==========================================
// SUPABASE DATABASE INITIALIZATION
// ==========================================
const SUPABASE_URL = 'sb_publishable_PaalaIFy_tKZWqrr6rX1zg_BtvG4fzV'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state tracking runtime authenticated user
let currentUser = null;
let currentAttendanceState = {}; // Temporary memory state for active attendance collection

// ==========================================
// AUTHENTICATION ENGINE
// ==========================================
document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const idInput = document.getElementById('username').value.trim();
    const passInput = document.getElementById('password').value;
    const errorDisplay = document.getElementById('login-error');

    errorDisplay.textContent = "Connecting to secure database...";

    // Fetch matching user row from Supabase Cloud
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', idInput)
        .eq('password', passInput)
        .maybeSingle();

    if (error) {
        errorDisplay.textContent = "Database connection error. Please try again.";
        console.error(error);
        return;
    }

    if (user) {
        currentUser = user;
        errorDisplay.textContent = "";
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        
        await setupDashboardView();
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
async function setupDashboardView() {
    // Hide all dashboard modules initially
    document.querySelectorAll('.dashboard-view').forEach(view => view.classList.add('hidden'));
    
    document.getElementById('welcome-text').textContent = `Welcome, ${currentUser.name}`;
    document.getElementById('user-role-badge').textContent = currentUser.role;

    if (currentUser.role === 'admin') {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        await initAdminViews(); 
    } else if (currentUser.role === 'teacher') {
        document.getElementById('teacher-dashboard').classList.remove('hidden');
        document.getElementById('teacher-course-name').textContent = currentUser.course_name || "Unassigned";
        await initTeacherViews();
    } else if (currentUser.role === 'student') {
        document.getElementById('student-dashboard').classList.remove('hidden');
        await initStudentViews();
    }
}

// ==========================================
// TEACHER CONTROLLER: ATTENDANCE & GRADES
// ==========================================
function switchTeacherTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

async function initTeacherViews() {
    const attendanceTableBody = document.getElementById('attendance-table-body');
    const gradesTableBody = document.getElementById('grades-table-body');
    
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;
    document.getElementById('attendance-date').value = new Date().toISOString().split('T')[0];

    // Clear old structural rows
    attendanceTableBody.innerHTML = '';
    gradesTableBody.innerHTML = '';
    currentAttendanceState = {};

    // 1. Fetch all registered students from Cloud Users profile directory
    const { data: students, error: studentErr } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'student');

    if (studentErr || !students) return;

    // 2. Fetch pre-existing grades for this course and workspace semester module
    const { data: gradesList } = await supabase
        .from('grades')
        .select('*')
        .eq('course_id', currentUser.course_id)
        .eq('semester', selectedSemester);

    students.forEach(student => {
        currentAttendanceState[student.id] = 'Present';

        // Build Attendance UI Table Row
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

        // Find exact cloud grade record mapping to active student context
        const exactGrade = (gradesList && gradesList.find(g => g.student_id === student.id)) || {
            attendance: 0, assignment: 0, mid_exam: 0, final_exam: 0
        };

        const totalScore = calculateRowTotal(exactGrade);

        // Build Grade Management UI Table Row
        const gradeRow = document.createElement('tr');
        gradeRow.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td><input type="number" min="0" max="10" value="${exactGrade.attendance || 0}" class="grade-input" data-sid="${student.id}" data-field="attendance" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="20" value="${exactGrade.assignment || 0}" class="grade-input" data-sid="${student.id}" data-field="assignment" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="20" value="${exactGrade.mid_exam || 0}" class="grade-input" data-sid="${student.id}" data-field="mid_exam" oninput="updateGradeTotalDisplay(this)"></td>
            <td><input type="number" min="0" max="50" value="${exactGrade.final_exam || 0}" class="grade-input" data-sid="${student.id}" data-field="final_exam" oninput="updateGradeTotalDisplay(this)"></td>
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
           (Number(gradeObj.mid_exam || gradeObj.midExam) || 0) + 
           (Number(gradeObj.final_exam || gradeObj.finalExam) || 0);
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
document.getElementById('save-attendance-btn').addEventListener('click', async function() {
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;

    if (!dateSelected) {
        alert("Please pick a valid calendar tracking date.");
        return;
    }

    // Clear matching daily duplicate entries if correcting errors
    await supabase
        .from('attendance_logs')
        .delete()
        .eq('date', dateSelected)
        .eq('course_id', currentUser.course_id);

    const newLogs = [];
    for (let studentId in currentAttendanceState) {
        newLogs.push({
            date: dateSelected,
            course_id: currentUser.course_id,
            student_id: studentId,
            status: currentAttendanceState[studentId],
            semester: selectedSemester
        });
    }

    const { error } = await supabase.from('attendance_logs').insert(newLogs);

    if (error) {
        alert("Error saving attendance to Cloud: " + error.message);
    } else {
        alert(`Attendance successfully stored for ${dateSelected}!`);
    }
});

// Save Grades Event
document.getElementById('save-grades-btn').addEventListener('click', async function() {
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value) || 4;
    
    // Extrapolate list of distinct student IDs present within current UI matrix view
    const studentIds = Array.from(new Set(Array.from(document.querySelectorAll('.grade-input')).map(i => i.getAttribute('data-sid'))));
    
    for (const studentId of studentIds) {
        const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
        
        let gradeData = {
            student_id: studentId,
            course_id: currentUser.course_id,
            course_name: currentUser.course_name,
            semester: selectedSemester
        };

        rowInputs.forEach(input => {
            const field = input.getAttribute('data-field'); 
            gradeData[field] = Number(input.value) || 0;
        });

        // Check if grade configuration row instance exists to clean overwrite or add fresh
        const { data: existingGrade } = await supabase
            .from('grades')
            .select('id')
            .eq('student_id', studentId)
            .eq('course_id', currentUser.course_id)
            .eq('semester', selectedSemester)
            .maybeSingle();

        if (existingGrade) {
            await supabase.from('grades').update(gradeData).eq('id', existingGrade.id);
        } else {
            await supabase.from('grades').insert([gradeData]);
        }
    }

    alert("Course marks and grades securely saved!");
});

// ==========================================
// STUDENT CONTROLLER: GPA & RECORDS
// ==========================================
async function initStudentViews() {
    const studentReportBody = document.getElementById('student-report-body');
    studentReportBody.innerHTML = '';

    // Fetch individual grade cards and cross-referenced logs mapped to target identity
    const { data: studentGrades } = await supabase.from('grades').select('*').eq('student_id', currentUser.id);
    const { data: studentLogs } = await supabase.from('attendance_logs').select('*').eq('student_id', currentUser.id);

    let totalPointsAcrossSemesters = 0;
    let totalCoursesCount = 0;

    if (studentGrades) {
        studentGrades.forEach(grade => {
            const totalScore = calculateRowTotal(grade);
            
            const courseAttendanceLogs = studentLogs 
                ? studentLogs.filter(l => l.course_id === grade.course_id && (!l.semester || l.semester === grade.semester))
                : [];
            
            const totalP = courseAttendanceLogs.filter(l => l.status === 'Present').length;
            const totalA = courseAttendanceLogs.filter(l => l.status === 'Absent').length;

            const gpaPoints = calculateGPAValue(totalScore);
            totalPointsAcrossSemesters += gpaPoints;
            totalCoursesCount++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Semester ${grade.semester}</td>
                <td><strong>${grade.course_name || 'General'}</strong></td>
                <td>${grade.attendance} / 10</td>
                <td>${grade.assignment} / 20</td>
                <td>${grade.mid_exam} / 20</td>
                <td>${grade.final_exam} / 50</td>
                <td><strong>${totalScore}</strong> (${gpaPoints.toFixed(2)} GP)</td>
                <td><span style="color:green;">P: ${totalP}</span> | <span style="color:red;">A: ${totalA}</span></td>
            `;
            studentReportBody.appendChild(tr);
        });
    }

    const cumulativeGPA = totalCoursesCount > 0 ? (totalPointsAcrossSemesters / totalCoursesCount) : 0.00;
    document.getElementById('student-cgpa').textContent = cumulativeGPA.toFixed(2);
}

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
document.getElementById('reset-db-btn').addEventListener('click', async function() {
    if (confirm("Are you sure you want to reset the database back to default demo records?")) {
        // Erase table rows
        await supabase.from('users').delete().neq('id', '');
        await supabase.from('grades').delete().neq('id', 0);
        await supabase.from('attendance_logs').delete().neq('id', 0);

        // Re-inject pristine starter schema configuration elements
        await supabase.from('users').insert([
            { id: "admin", password: "admin123", role: "admin", name: "System Admin" },
            { id: "teacher1", password: "teacher123", role: "teacher", name: "Dr. Sarah Ahmed", course_id: "CS101", course_name: "Computer Science" },
            { id: "student1", password: "student123", role: "student", name: "Isaac Mohamed" }
        ]);

        alert("Cloud Database successfully wiped and reset to default data items.");
        location.reload();
    }
});

async function initAdminViews() {
    const adminUsersTableBody = document.getElementById('admin-users-table-body');
    adminUsersTableBody.innerHTML = '';

    const { data: users } = await supabase.from('users').select('*');

    if (users) {
        users.forEach(user => {
            const tr = document.createElement('tr');
            const courseDetails = user.role === 'teacher' ? `${user.course_name} (${user.course_id})` : '-';
            
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
}

function toggleAdminCourseFields() {
    const roleSelected = document.getElementById('new-user-role').value;
    const courseFields = document.getElementById('admin-course-fields');
    if (roleSelected === 'teacher') {
        courseFields.classList.remove('hidden');
    } else {
        courseFields.classList.add('hidden');
    }
}

document.getElementById('admin-add-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('new-user-id').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;

    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', id)
        .maybeSingle();

    if (existingUser) {
        alert("A user with this matching identification key already exists!");
        return;
    }

    const newUser = { id, password, role, name };

    if (role === 'teacher') {
        newUser.course_id = document.getElementById('new-user-cid').value.trim() || "GEN101";
        newUser.course_name = document.getElementById('new-user-cname').value.trim() || "General Course";
    }

    const { error } = await supabase.from('users').insert([newUser]);

    if (error) {
        alert("Error creating record: " + error.message);
        return;
    }

    await initAdminViews();
    
    document.getElementById('admin-add-user-form').reset();
    toggleAdminCourseFields();
    alert(`Account for ${name} successfully initialized!`);
});

async function deleteUser(userId) {
    if (confirm(`Are you sure you want to permanently delete user [${userId}]?`)) {
        await supabase.from('users').delete().eq('id', userId);
        // Cascade structural cleanups across referencing grade tables
        await supabase.from('grades').delete().eq('student_id', userId);
        await supabase.from('attendance_logs').delete().eq('student_id', userId);
        
        await initAdminViews();
        alert("User completely removed from system database storage.");
    }
}

// ==========================================
// GLOBAL WINDOW CONTEXT BINDINGS
// ==========================================
window.toggleAdminCourseFields = toggleAdminCourseFields;
window.deleteUser = deleteUser;
window.setAttendanceStatus = setAttendanceStatus;
window.switchTeacherTab = switchTeacherTab;
window.initTeacherViews = initTeacherViews;
window.updateGradeTotalDisplay = updateGradeTotalDisplay;
