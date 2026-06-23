import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mxdplsijbisozgzamugg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAttendanceState = {};

// ==========================================
// UTILITIES
// ==========================================
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function setButtonBusy(button, busyLabel, idleLabel) {
    if (!button) return;
    button.disabled = !!busyLabel;
    button.textContent = busyLabel || idleLabel;
}

// ==========================================
// LOGIN / LOGOUT
// ==========================================
document.getElementById('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const idInput = document.getElementById('username').value.trim();
    const passInput = document.getElementById('password').value;
    const errorDisplay = document.getElementById('login-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    errorDisplay.textContent = 'Connecting to secure database...';
    setButtonBusy(submitBtn, 'Logging in...');

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', idInput)
            .eq('password', passInput)
            .maybeSingle();

        if (error) {
            errorDisplay.textContent = 'Database connection error. Please try again.';
            console.error(error);
            return;
        }

        if (user) {
            currentUser = user;
            errorDisplay.textContent = '';
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            await setupDashboardView();
        } else {
            errorDisplay.textContent = 'Invalid User ID or Password.';
        }
    } finally {
        setButtonBusy(submitBtn, null, 'Login');
    }
});

document.getElementById('logout-btn').addEventListener('click', function () {
    currentUser = null;
    currentAttendanceState = {};
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('login-form').reset();
});

// ==========================================
// VIEW ROUTING CONTROLLER
// ==========================================
async function setupDashboardView() {
    try {
        document.querySelectorAll('.dashboard-view').forEach((view) => view.classList.add('hidden'));

        const welcomeText = document.getElementById('welcome-text');
        const roleBadge = document.getElementById('user-role-badge');

        if (welcomeText) welcomeText.textContent = `Welcome, ${currentUser.name}`;
        if (roleBadge) roleBadge.textContent = currentUser.role.replace('_', ' ').toUpperCase();

        const normalizedRole = (currentUser.role || '').toLowerCase().trim();

        if (normalizedRole === 'admin_users' || normalizedRole === 'admin_all' || normalizedRole === 'admin') {
            const adminDash = document.getElementById('admin-dashboard');
            if (adminDash) {
                adminDash.classList.remove('hidden');
                
                // Show Grade entry only if Super Admin (admin_all)
                const gradePanel = document.getElementById('admin-grade-management');
                if (normalizedRole === 'admin_all') {
                    gradePanel.classList.remove('hidden');
                } else {
                    gradePanel.classList.add('hidden');
                }

                await initAdminViews();
            }
        } else if (normalizedRole === 'teacher') {
            const teacherDash = document.getElementById('teacher-dashboard');
            if (teacherDash) {
                teacherDash.classList.remove('hidden');
                const courseNameEl = document.getElementById('teacher-course-name');
                if (courseNameEl) courseNameEl.textContent = currentUser.course_name || 'Unassigned';
                await initTeacherViews();
            }
        } else if (normalizedRole === 'student') {
            const studentDash = document.getElementById('student-dashboard');
            if (studentDash) {
                studentDash.classList.remove('hidden');
                await initStudentViews();
            }
        }
    } catch (err) {
        console.error('Dashboard routing crashed:', err);
    }
}

window.switchTeacherTab = function (tabId, event) {
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
};

window.toggleAdminCourseFields = function () {
    const roleSelect = document.getElementById('new-user-role').value;
    const courseFields = document.getElementById('admin-course-fields');
    if (roleSelect === 'teacher') {
        courseFields.classList.remove('hidden');
    } else {
        courseFields.classList.add('hidden');
    }
};

// ==========================================
// ADMIN DASHBOARD
// ==========================================

async function initAdminViews() {
    const tableBody = document.getElementById('admin-users-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="5">Loading users...</td></tr>';

    const { data: users, error } = await supabase.from('users').select('*').order('role', { ascending: true });
    
    if (error) {
        tableBody.innerHTML = '<tr><td colspan="5">Error loading users</td></tr>';
        return;
    }

    tableBody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(u.id)}</td>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.role)}</td>
            <td>${escapeHtml(u.course_name || 'N/A')}</td>
            <td><button class="btn btn-danger" onclick="deleteUser('${escapeHtml(u.id)}')">Delete</button></td>
        `;
        tableBody.appendChild(tr);
    });
}

document.getElementById('admin-add-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setButtonBusy(btn, 'Creating...', 'Create User Account');

    const id = document.getElementById('new-user-id').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const pass = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    let course_id = null;
    let course_name = null;

    if (role === 'teacher') {
        course_id = document.getElementById('new-user-cid').value.trim();
        course_name = document.getElementById('new-user-cname').value.trim();
    }

    const { error } = await supabase.from('users').insert([{ id, name, password: pass, role, course_id, course_name }]);
    
    setButtonBusy(btn, null, 'Create User Account');
    
    if (error) {
        alert('Error adding user. ID might already exist.');
    } else {
        alert('User added successfully!');
        e.target.reset();
        toggleAdminCourseFields();
        initAdminViews();
    }
});

// Admin Add Grade Logic
const adminAddGradeForm = document.getElementById('admin-add-grade-form');
if (adminAddGradeForm) {
    adminAddGradeForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const msg = document.getElementById('admin-grade-msg');
        
        setButtonBusy(btn, 'Saving...', 'Submit Grades');
        msg.textContent = '';
        msg.style.color = '#333';

        const payload = {
            admin_id: currentUser.id,
            admin_pass: currentUser.password,
            p_student_id: document.getElementById('ag-student-id').value.trim(),
            p_course_name: document.getElementById('ag-course-name').value.trim(),
            p_course_id: document.getElementById('ag-course-id').value.trim(),
            p_semester: parseInt(document.getElementById('ag-semester').value, 10),
            p_attendance: parseFloat(document.getElementById('ag-attendance').value),
            p_assignment: parseFloat(document.getElementById('ag-assignment').value),
            p_mid_exam: parseFloat(document.getElementById('ag-mid').value),
            p_final_exam: parseFloat(document.getElementById('ag-final').value)
        };

        const { error } = await supabase.rpc('secure_admin_save_grade', payload);

        setButtonBusy(btn, null, 'Submit Grades');

        if (error) {
            console.error(error);
            msg.style.color = 'var(--danger-color)';
            msg.textContent = 'Failed to save grade. Check console for details or ensure Student ID exists.';
        } else {
            msg.style.color = 'var(--success-color)';
            msg.textContent = 'Grades saved successfully!';
            e.target.reset();
        }
    });
}

window.deleteUser = async function(id) {
    if(confirm(`Are you sure you want to delete user ${id}?`)) {
        await supabase.from('users').delete().eq('id', id);
        initAdminViews();
    }
}

// ==========================================
// TEACHER DASHBOARD
// ==========================================
window.initTeacherViews = async function () {
    try {
        const attendanceTableBody = document.getElementById('attendance-table-body');
        const gradesTableBody = document.getElementById('grades-table-body');
        const semesterSelect = document.getElementById('teacher-semester-select');
        const attendanceDateInput = document.getElementById('attendance-date');

        if (!attendanceTableBody || !gradesTableBody || !semesterSelect || !attendanceDateInput) return;

        const selectedSemester = parseInt(semesterSelect.value, 10) || 4;
        if (!attendanceDateInput.value) {
            attendanceDateInput.value = new Date().toISOString().split('T')[0];
        }

        attendanceTableBody.innerHTML = '';
        gradesTableBody.innerHTML = '';
        currentAttendanceState = {};

        const { data: students, error: studentErr } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'student');

        if (studentErr) return console.error(studentErr);
        if (!students || students.length === 0) return;

        const { data: gradesList } = await supabase
            .from('grades')
            .select('*')
            .eq('course_id', currentUser.course_id)
            .eq('semester', selectedSemester);

        const { data: courseLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('course_id', currentUser.course_id);

        students.forEach((student) => {
            currentAttendanceState[student.id] = 'Present';
            const safeId = escapeHtml(student.id);
            const safeName = escapeHtml(student.name);

            const attendanceRow = document.createElement('tr');
            attendanceRow.innerHTML = `
                <td>${safeId}</td>
                <td>${safeName}</td>
                <td>
                    <button type="button" class="btn btn-toggle active-present" id="p-${safeId}" onclick="setAttendanceStatus('${safeId}', 'Present')">Present</button>
                    <button type="button" class="btn btn-toggle" id="a-${safeId}" onclick="setAttendanceStatus('${safeId}', 'Absent')">Absent</button>
                </td>
            `;
            attendanceTableBody.appendChild(attendanceRow);

            const exactGrade = (gradesList && gradesList.find((g) => g.student_id === student.id)) || {
                attendance: 0, assignment: 0, mid_exam: 0, final_exam: 0
            };

            const totalScore = calculateRowTotal(exactGrade);

            const studentCourseLogs = courseLogs
                ? courseLogs.filter((l) => l.student_id === student.id && (!l.semester || l.semester === selectedSemester))
                : [];
            const totalP = studentCourseLogs.filter((l) => l.status === 'Present').length;
            const totalA = studentCourseLogs.filter((l) => l.status === 'Absent').length;
            const recordStr = `<span style="color:green; font-weight:600;">P: ${totalP}</span> | <span style="color:red; font-weight:600;">A: ${totalA}</span>`;

            const gradeRow = document.createElement('tr');
            gradeRow.innerHTML = `
                <td>${safeId}</td>
                <td>${safeName}</td>
                <td>${recordStr}</td>
                <td><input type="number" min="0" max="10" value="${exactGrade.attendance || 0}" class="grade-input" data-sid="${safeId}" data-field="attendance" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.assignment || 0}" class="grade-input" data-sid="${safeId}" data-field="assignment" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.mid_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="mid_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="50" value="${exactGrade.final_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="final_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><strong id="total-${safeId}">${totalScore}</strong>/100</td>
            `;
            gradesTableBody.appendChild(gradeRow);
        });

        await loadAttendanceForDate(attendanceDateInput.value, courseLogs);
        attendanceDateInput.onchange = () => loadAttendanceForDate(attendanceDateInput.value, courseLogs);
    } catch (err) {
        console.error('Runtime view rendering crashed:', err);
    }
};

async function loadAttendanceForDate(date, preloadedLogs) {
    if (!date) return;
    let logsForDate = (preloadedLogs || []).filter((l) => l.date === date);

    if (logsForDate.length === 0) {
        const { data: fetchedLogs, error } = await supabase
            .from('attendance_logs')
            .select('student_id, status, date')
            .eq('course_id', currentUser.course_id)
            .eq('date', date);
        if (error) return console.error(error);
        logsForDate = fetchedLogs || [];
    }

    Object.keys(currentAttendanceState).forEach((studentId) => setAttendanceStatus(studentId, 'Present'));
    logsForDate.forEach((log) => setAttendanceStatus(log.student_id, log.status));
}

window.setAttendanceStatus = function (studentId, status) {
    currentAttendanceState[studentId] = status;
    const presentBtn = document.getElementById(`p-${studentId}`);
    const absentBtn = document.getElementById(`a-${studentId}`);

    if (status === 'Present') {
        if (presentBtn) presentBtn.classList.add('active-present');
        if (absentBtn) absentBtn.classList.remove('active-absent');
    } else {
        if (absentBtn) absentBtn.classList.add('active-absent');
        if (presentBtn) presentBtn.classList.remove('active-present');
    }
};

function calculateRowTotal(gradeObj) {
    return (Number(gradeObj.attendance) || 0)
        + (Number(gradeObj.assignment) || 0)
        + (Number(gradeObj.mid_exam) || 0)
        + (Number(gradeObj.final_exam) || 0);
}

window.updateGradeTotalDisplay = function (inputElement) {
    const studentId = inputElement.getAttribute('data-sid');
    const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
    let total = 0;
    rowInputs.forEach((input) => {
        total += Number(input.value) || 0;
    });
    const label = document.getElementById(`total-${studentId}`);
    if (label) label.textContent = total;
};

// Teacher - Save Attendance File Fix
document.getElementById('save-attendance-btn').addEventListener('click', async function () {
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const saveBtn = this;

    if (!dateSelected) {
        alert('Please pick a valid calendar tracking date.');
        return;
    }

    const logArray = Object.entries(currentAttendanceState).map(([studentId, status]) => ({
        student_id: studentId,
        status: status
    }));

    setButtonBusy(saveBtn, 'Saving...', 'Save Attendance Sheet');
    try {
        const { error } = await supabase.rpc('secure_teacher_save_attendance', {
            teacher_id: currentUser.id,
            teacher_pass: currentUser.password,
            p_date: dateSelected,
            p_course_id: currentUser.course_id,
            p_semester: selectedSemester,
            log_data: logArray
        });

        if (error) throw error;
        alert('Attendance securely saved!');
    } catch (err) {
        console.error(err);
        alert('Failed to save attendance: ' + err.message);
    } finally {
        setButtonBusy(saveBtn, null, 'Save Attendance Sheet');
    }
});

// Teacher - Save Grades File Fix
document.getElementById('save-grades-btn').addEventListener('click', async function () {
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const saveBtn = this;
    
    const gradeInputs = document.querySelectorAll('.grade-input');
    const gradesData = {};

    gradeInputs.forEach(input => {
        const sid = input.getAttribute('data-sid');
        const field = input.getAttribute('data-field');
        if (!gradesData[sid]) gradesData[sid] = { student_id: sid };
        gradesData[sid][field] = Number(input.value) || 0;
    });

    const gradeArray = Object.values(gradesData);

    setButtonBusy(saveBtn, 'Saving...', 'Save Academic Grades');
    try {
        const { error } = await supabase.rpc('secure_teacher_save_grades', {
            teacher_id: currentUser.id,
            teacher_pass: currentUser.password,
            p_course_id: currentUser.course_id,
            p_course_name: currentUser.course_name,
            p_semester: selectedSemester,
            grade_data: gradeArray
        });

        if (error) throw error;
        alert('Grades securely saved!');
    } catch (err) {
        console.error(err);
        alert('Failed to save grades: ' + err.message);
    } finally {
        setButtonBusy(saveBtn, null, 'Save Academic Grades');
    }
});

// ==========================================
// STUDENT DASHBOARD
// ==========================================
async function initStudentViews() {
    const reportBody = document.getElementById('student-report-body');
    const cgpaHeader = document.getElementById('student-cgpa');
    
    if (!reportBody) return;
    reportBody.innerHTML = '<tr><td colspan="8">Loading academic record...</td></tr>';

    const { data: grades, error } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', currentUser.id)
        .order('semester', { ascending: true });

    if (error) {
        reportBody.innerHTML = '<tr><td colspan="8">Error fetching grades</td></tr>';
        return;
    }

    if (!grades || grades.length === 0) {
        reportBody.innerHTML = '<tr><td colspan="8">No grades posted yet.</td></tr>';
        return;
    }

    reportBody.innerHTML = '';
    let totalScoreSum = 0;

    grades.forEach(g => {
        const total = (Number(g.attendance)||0) + (Number(g.assignment)||0) + (Number(g.mid_exam)||0) + (Number(g.final_exam)||0);
        totalScoreSum += total;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Semester ${g.semester}</td>
            <td>${escapeHtml(g.course_name || g.course_id)}</td>
            <td>${g.attendance}</td>
            <td>${g.assignment}</td>
            <td>${g.mid_exam}</td>
            <td>${g.final_exam}</td>
            <td><strong>${total}</strong></td>
            <td>Check Teacher Portal</td>
        `;
        reportBody.appendChild(tr);
    });

    if (grades.length > 0 && cgpaHeader) {
        const avg = totalScoreSum / grades.length;
        // Simple mapping to a 4.0 scale purely for demo visualization
        const gpa = (avg / 100) * 4.0; 
        cgpaHeader.textContent = gpa.toFixed(2);
    }
}
