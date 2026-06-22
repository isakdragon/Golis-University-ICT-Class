import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mxdplsijbisozgzamugg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAttendanceState = {};

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
// AUTHENTICATION
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
// VIEW ROUTING
// ==========================================
async function setupDashboardView() {
    try {
        document.querySelectorAll('.dashboard-view').forEach((view) => view.classList.add('hidden'));

        const welcomeText = document.getElementById('welcome-text');
        const roleBadge = document.getElementById('user-role-badge');

        if (welcomeText) welcomeText.textContent = `Welcome, ${currentUser.name}`;
        if (roleBadge) roleBadge.textContent = currentUser.role.replace('_', ' ');

        const normalizedRole = (currentUser.role || '').toLowerCase().trim();

        if (normalizedRole === 'admin_users' || normalizedRole === 'admin_all' || normalizedRole === 'admin') {
            const adminDash = document.getElementById('admin-dashboard');
            if (adminDash) {
                adminDash.classList.remove('hidden');
                
                // Show/Hide Grade Card based on specific Admin type
                const adminGradesCard = document.getElementById('admin-grades-card');
                if (normalizedRole === 'admin_all' || normalizedRole === 'admin') {
                    adminGradesCard.classList.remove('hidden');
                } else {
                    adminGradesCard.classList.add('hidden');
                }
                await initAdminViews();
            }
        } else if (normalizedRole === 'teacher') {
            const teacherDash = document.getElementById('teacher-dashboard');
            if (teacherDash) {
                teacherDash.classList.remove('hidden');
                document.getElementById('teacher-course-name').textContent = currentUser.course_name || 'Unassigned';
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
        console.error('Dashboard routing failed:', err);
    }
}

// ==========================================
// UNIFIED TEACHER WORKSPACE
// ==========================================
window.initTeacherViews = async function () {
    try {
        const unifiedBody = document.getElementById('unified-teacher-table-body');
        const semesterSelect = document.getElementById('teacher-semester-select');
        const attendanceDateInput = document.getElementById('attendance-date');

        if (!unifiedBody || !semesterSelect || !attendanceDateInput) return;

        const selectedSemester = parseInt(semesterSelect.value, 10) || 4;
        if (!attendanceDateInput.value) {
            attendanceDateInput.value = new Date().toISOString().split('T')[0];
        }

        unifiedBody.innerHTML = '';
        currentAttendanceState = {};

        const { data: students, error: studentErr } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'student');

        if (studentErr || !students) return;

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

            const exactGrade = (gradesList && gradesList.find((g) => g.student_id === student.id)) || {
                attendance: 0, assignment: 0, mid_exam: 0, final_exam: 0
            };

            const totalScore = (Number(exactGrade.attendance) || 0) + 
                               (Number(exactGrade.assignment) || 0) + 
                               (Number(exactGrade.mid_exam) || 0) + 
                               (Number(exactGrade.final_exam) || 0);

            const studentCourseLogs = courseLogs ? courseLogs.filter((l) => l.student_id === student.id) : [];
            const totalP = studentCourseLogs.filter((l) => l.status === 'Present').length;
            const totalA = studentCourseLogs.filter((l) => l.status === 'Absent').length;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${safeId}</td>
                <td>${safeName}</td>
                <td>
                    <button type="button" class="btn btn-toggle active-present" id="p-${safeId}" onclick="setAttendanceStatus('${safeId}', 'Present')">P</button>
                    <button type="button" class="btn btn-toggle" id="a-${safeId}" onclick="setAttendanceStatus('${safeId}', 'Absent')">A</button>
                </td>
                <td><span style="color:green;">P: ${totalP}</span> | <span style="color:red;">A: ${totalA}</span></td>
                <td><input type="number" min="0" max="10" value="${exactGrade.attendance || 0}" class="grade-input" data-sid="${safeId}" data-field="attendance" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.assignment || 0}" class="grade-input" data-sid="${safeId}" data-field="assignment" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.mid_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="mid_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="50" value="${exactGrade.final_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="final_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><strong id="total-${safeId}">${totalScore}</strong>/100</td>
            `;
            unifiedBody.appendChild(row);
        });

        await loadAttendanceForDate(attendanceDateInput.value, courseLogs);
        attendanceDateInput.onchange = () => loadAttendanceForDate(attendanceDateInput.value, courseLogs);
    } catch (err) {
        console.error(err);
    }
};

async function loadAttendanceForDate(date, preloadedLogs) {
    let logsForDate = (preloadedLogs || []).filter((l) => l.date === date);
    Object.keys(currentAttendanceState).forEach((id) => setAttendanceStatus(id, 'Present'));
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

window.updateGradeTotalDisplay = function (inputElement) {
    const studentId = inputElement.getAttribute('data-sid');
    const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
    let total = 0;
    rowInputs.forEach((input) => total += Number(input.value) || 0);
    const label = document.getElementById(`total-${studentId}`);
    if (label) label.textContent = total;
};

// Save Attendance Event
document.getElementById('save-attendance-btn').addEventListener('click', async function () {
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    if (!dateSelected) return alert('Select a date');

    const newLogs = Object.entries(currentAttendanceState).map(([student_id, status]) => ({ student_id, status }));
    setButtonBusy(this, 'Saving...');
    try {
        const { error } = await supabase.rpc('secure_teacher_save_attendance', {
            teacher_id: currentUser.id,
            teacher_pass: currentUser.password,
            p_date: dateSelected,
            p_course_id: currentUser.course_id,
            p_semester: selectedSemester,
            log_data: newLogs
        });
        if (error) alert(error.message);
        else alert('Attendance recorded successfully.');
    } finally {
        setButtonBusy(this, null, "Save Today's Attendance Sheet");
    }
});

// Save Grades Event
document.getElementById('save-grades-btn').addEventListener('click', async function () {
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const inputs = document.querySelectorAll('.grade-input');
    const gradeMap = {};

    inputs.forEach((input) => {
        const sid = input.getAttribute('data-sid');
        const field = input.getAttribute('data-field');
        if (!gradeMap[sid]) gradeMap[sid] = { student_id: sid, course_id: currentUser.course_id, semester: selectedSemester };
        gradeMap[sid][field] = Number(input.value) || 0;
    });

    setButtonBusy(this, 'Saving Grades...');
    try {
        const chunks = Object.values(gradeMap);
        for (const chunk of chunks) {
            await supabase.from('grades').upsert(chunk, { onConflict: 'student_id,course_id,semester' });
        }
        alert('Academic grades updated successfully!');
        await initTeacherViews();
    } catch (err) {
        console.error(err);
    } finally {
        setButtonBusy(this, null, 'Save Academic Grades');
    }
});

// ==========================================
// ADMIN DASHBOARD & DIRECT GRADING
// ==========================================
async function initAdminViews() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const { data: users } = await supabase.from('users').select('*');
    if (!users) return;

    users.forEach((u) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(u.id)}</td>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.role)}</td>
            <td>${escapeHtml(u.course_name || 'N/A')}</td>
            <td><button class="btn btn-danger" onclick="deleteUser('${u.id}')">Delete</button></td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleAdminCourseFields = function () {
    const role = document.getElementById('new-user-role').value;
    const wrapper = document.getElementById('admin-course-fields');
    if (role === 'teacher') wrapper.classList.remove('hidden');
    else wrapper.classList.add('hidden');
};

// Admin Add User
document.getElementById('admin-add-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const id = document.getElementById('new-user-id').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    const course_id = document.getElementById('new-user-cid').value.trim() || null;
    const course_name = document.getElementById('new-user-cname').value.trim() || null;

    const { error } = await supabase.from('users').insert([{ id, name, password, role, course_id, course_name }]);
    if (error) alert(error.message);
    else {
        alert('User generated!');
        this.reset();
        await initAdminViews();
    }
});

// Super Admin Direct Grade Form Submission (Requirement 2 Form Format)
document.getElementById('admin-add-grade-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    
    const student_id = document.getElementById('admin-grade-sid').value.trim();
    const course_id = document.getElementById('admin-grade-cid').value.trim();
    const semester = parseInt(document.getElementById('admin-grade-semester').value, 10);
    const attendance = Number(document.getElementById('admin-grade-atten').value) || 0;
    const assignment = Number(document.getElementById('admin-grade-assign').value) || 0;
    const mid_exam = Number(document.getElementById('admin-grade-mid').value) || 0;
    const final_exam = Number(document.getElementById('admin-grade-final').value) || 0;

    const submitBtn = this.querySelector('button[type="submit"]');
    setButtonBusy(submitBtn, 'Inserting grade...');

    try {
        const { error } = await supabase.from('grades').upsert({
            student_id,
            course_id,
            semester,
            attendance,
            assignment,
            mid_exam,
            final_exam
        }, { onConflict: 'student_id,course_id,semester' });

        if (error) alert('Error: ' + error.message);
        else {
            alert('Grade successfully logged by Admin!');
            this.reset();
        }
    } finally {
        setButtonBusy(submitBtn, null, 'Submit Academic Grade Record');
    }
});

window.deleteUser = async function(id) {
    if (!confirm('Delete user?')) return;
    await supabase.from('users').delete().eq('id', id);
    await initAdminViews();
};

// ==========================================
// STUDENT PROFILE LOGIC
// ==========================================
async function initStudentViews() {
    const tbody = document.getElementById('student-report-body');
    const cgpaLabel = document.getElementById('student-cgpa');
    if (!tbody || !cgpaLabel) return;

    tbody.innerHTML = '';

    const { data: grades } = await supabase.from('grades').select('*').eq('student_id', currentUser.id);
    const { data: logs } = await supabase.from('attendance_logs').select('*').eq('student_id', currentUser.id);

    if (!grades || grades.length === 0) {
        cgpaLabel.textContent = "0.00";
        return;
    }

    let grandTotal = 0;
    grades.forEach((g) => {
        const total = (g.attendance || 0) + (g.assignment || 0) + (g.mid_exam || 0) + (g.final_exam || 0);
        grandTotal += total;

        const sLogs = logs ? logs.filter((l) => l.course_id === g.course_id) : [];
        const p = sLogs.filter((l) => l.status === 'Present').length;
        const a = sLogs.filter((l) => l.status === 'Absent').length;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Semester ${g.semester}</td>
            <td>${escapeHtml(g.course_id)}</td>
            <td>${g.attendance}</td>
            <td>${g.assignment}</td>
            <td>${g.mid_exam}</td>
            <td>${g.final_exam}</td>
            <td><strong>${total}</strong>/100</td>
            <td>P: ${p} | A: ${a}</td>
        `;
        tbody.appendChild(tr);
    });

    const avg = grandTotal / grades.length;
    cgpaLabel.textContent = ((avg / 100) * 4).toFixed(2);
}
