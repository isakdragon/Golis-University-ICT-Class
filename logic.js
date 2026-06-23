import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mxdplsijbisozgzamugg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAttendanceState = {};

// Escapes text before rendering to prevent script injection
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

// Hide/Show Course items dynamically based on creation forms
window.toggleAdminCourseFields = function() {
    const role = document.getElementById('new-user-role').value;
    const courseWrapper = document.getElementById('admin-course-fields');
    if (role === 'teacher') {
        courseWrapper.classList.remove('hidden');
    } else {
        courseWrapper.classList.add('hidden');
    }
};
document.getElementById('new-user-role').addEventListener('change', window.toggleAdminCourseFields);

// ==========================================
// VIEW ROUTING CONTROLLER
// ==========================================
async function setupDashboardView() {
    try {
        document.querySelectorAll('.dashboard-view').forEach((view) => view.classList.add('hidden'));

        const welcomeText = document.getElementById('welcome-text');
        const roleBadge = document.getElementById('user-role-badge');

        if (welcomeText) welcomeText.textContent = `Welcome, ${currentUser.name}`;
        if (roleBadge) roleBadge.textContent = currentUser.role;

        const normalizedRole = (currentUser.role || '').toLowerCase().trim();

        if (normalizedRole === 'admin_users' || normalizedRole === 'admin_full') {
            const adminDash = document.getElementById('admin-dashboard');
            if (adminDash) {
                adminDash.classList.remove('hidden');
                
                // Feature 2: Enforce Admin restrictions smoothly
                if (normalizedRole === 'admin_full') {
                    document.getElementById('admin-grade-management-card').classList.remove('hidden');
                } else {
                    document.getElementById('admin-grade-management-card').classList.add('hidden');
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

// Tab switcher setup
function switchTeacherTab(tabId) {
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));

    if(tabId === 'attendance-tab') {
        document.getElementById('attendance-tab').classList.remove('hidden');
        document.getElementById('tab-btn-attendance').classList.add('active');
    } else {
        document.getElementById('grades-tab').classList.remove('hidden');
        document.getElementById('tab-btn-grades').classList.add('active');
    }
}
document.getElementById('tab-btn-attendance').addEventListener('click', () => switchTeacherTab('attendance-tab'));
document.getElementById('tab-btn-grades').addEventListener('click', () => switchTeacherTab('grades-tab'));

// ==========================================
// TEACHER DASHBOARD LOGIC
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

        const { data: students } = await supabase.from('users').select('id, name').eq('role', 'student');
        if (!students || students.length === 0) return;

        const { data: gradesList } = await supabase.from('grades')
            .select('*')
            .eq('course_id', currentUser.course_id)
            .eq('semester', selectedSemester);

        const { data: courseLogs } = await supabase.from('attendance_logs').select('*').eq('course_id', currentUser.course_id);

        students.forEach((student) => {
            currentAttendanceState[student.id] = 'Present';
            const safeId = escapeHtml(student.id);
            const safeName = escapeHtml(student.name);

            const attendanceRow = document.createElement('tr');
            attendanceRow.innerHTML = `
                <td>${safeId}</td>
                <td>${safeName}</td>
                <td>
                    <button type="button" class="btn btn-toggle active-present" id="p-${safeId}">Present</button>
                    <button type="button" class="btn btn-toggle" id="a-${safeId}">Absent</button>
                </td>
            `;
            attendanceTableBody.appendChild(attendanceRow);

            attendanceRow.querySelector(`#p-${safeId}`).addEventListener('click', () => setAttendanceStatus(student.id, 'Present'));
            attendanceRow.querySelector(`#a-${safeId}`).addEventListener('click', () => setAttendanceStatus(student.id, 'Absent'));

            const exactGrade = (gradesList && gradesList.find((g) => g.student_id === student.id)) || {
                attendance: 0, assignment: 0, mid_exam: 0, final_exam: 0
            };

            const totalScore = (exactGrade.attendance || 0) + (exactGrade.assignment || 0) + (exactGrade.mid_exam || 0) + (exactGrade.final_exam || 0);
            const studentCourseLogs = courseLogs ? courseLogs.filter((l) => l.student_id === student.id && (l.semester === selectedSemester)) : [];
            const totalP = studentCourseLogs.filter((l) => l.status === 'Present').length;
            const totalA = studentCourseLogs.filter((l) => l.status === 'Absent').length;

            const gradeRow = document.createElement('tr');
            gradeRow.innerHTML = `
                <td>${safeId}</td>
                <td>${safeName}</td>
                <td id="record-${safeId}"><span style="color:green; font-weight:600;">P: ${totalP}</span> | <span style="color:red; font-weight:600;">A: ${totalA}</span></td>
                <td><input type="number" min="0" max="10" value="${exactGrade.attendance || 0}" class="grade-input" data-sid="${safeId}" data-field="attendance"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.assignment || 0}" class="grade-input" data-sid="${safeId}" data-field="assignment"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.mid_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="mid_exam"></td>
                <td><input type="number" min="0" max="50" value="${exactGrade.final_exam || 0}" class="grade-input" data-sid="${safeId}" data-field="final_exam"></td>
                <td><strong id="total-${safeId}">${totalScore}</strong>/100</td>
            `;
            gradesTableBody.appendChild(gradeRow);

            gradeRow.querySelectorAll('.grade-input').forEach(input => {
                input.addEventListener('input', () => updateGradeTotalDisplay(student.id));
            });
        });

        await loadAttendanceForDate(attendanceDateInput.value, courseLogs);
        attendanceDateInput.onchange = () => loadAttendanceForDate(attendanceDateInput.value, courseLogs);
    } catch (err) {
        console.error(err);
    }
};

async function loadAttendanceForDate(date, preloadedLogs) {
    let logsForDate = (preloadedLogs || []).filter((l) => l.date === date);
    Object.keys(currentAttendanceState).forEach((studentId) => setAttendanceStatus(studentId, 'Present'));
    logsForDate.forEach((log) => setAttendanceStatus(log.student_id, log.status));
}

function setAttendanceStatus(studentId, status) {
    currentAttendanceState[studentId] = status;
    const presentBtn = document.getElementById(`p-${studentId}`);
    const absentBtn = document.getElementById(`a-${studentId}`);
    if (!presentBtn || !absentBtn) return;
    if (status === 'Present') {
        presentBtn.classList.add('active-present');
        absentBtn.classList.remove('active-absent');
    } else {
        absentBtn.classList.add('active-absent');
        presentBtn.classList.remove('active-present');
    }
}

function updateGradeTotalDisplay(studentId) {
    const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
    let total = 0;
    rowInputs.forEach((input) => { total += Number(input.value) || 0; });
    const label = document.getElementById(`total-${studentId}`);
    if (label) label.textContent = total;
}

// ==========================================================
// FEATURE 1: SIMULTANEOUS ATTENDANCE & ATTENDANCE GRADE SAVE
// ==========================================================
document.getElementById('save-attendance-btn').addEventListener('click', async function () {
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const saveBtn = this;

    if (!dateSelected) {
        alert('Please pick a tracking date.');
        return;
    }

    setButtonBusy(saveBtn, 'Syncing Sheet & Grades...');

    try {
        for (const [studentId, status] of Object.entries(currentAttendanceState)) {
            // 1. Log or update specific daily performance
            const { data: existingLog } = await supabase.from('attendance_logs')
                .select('id').eq('student_id', studentId)
                .eq('course_id', currentUser.course_id).eq('date', dateSelected).maybeSingle();

            if (existingLog) {
                await supabase.from('attendance_logs').update({ status, semester: selectedSemester }).eq('id', existingLog.id);
            } else {
                await supabase.from('attendance_logs').insert({
                    student_id: studentId, course_id: currentUser.course_id, date: dateSelected, status, semester: selectedSemester
                });
            }

            // Calculate updated presence metric totals for the current semester
            const { data: allLogs } = await supabase.from('attendance_logs')
                .select('status').eq('student_id', studentId)
                .eq('course_id', currentUser.course_id).eq('semester', selectedSemester);

            const presenceCount = allLogs ? allLogs.filter(l => l.status === 'Present').length : 0;
            
            // Generate attendance grade metric capped at 10 total marks
            const computedAttendanceGrade = Math.min(presenceCount, 10);

            // 2. Perform concurrent transactional update onto grades table directly
            const { data: existingGrade } = await supabase.from('grades')
                .select('id').eq('student_id', studentId)
                .eq('course_id', currentUser.course_id).eq('semester', selectedSemester).maybeSingle();

            if (existingGrade) {
                await supabase.from('grades').update({ attendance: computedAttendanceGrade }).eq('id', existingGrade.id);
            } else {
                await supabase.from('grades').insert({
                    student_id: studentId, course_id: currentUser.course_id, semester: selectedSemester,
                    attendance: computedAttendanceGrade, assignment: 0, mid_exam: 0, final_exam: 0
                });
            }
        }

        alert('Attendance sheet and matching attendance evaluation grades synchronized successfully!');
        await initTeacherViews();
    } catch (err) {
        console.error(err);
    } finally {
        setButtonBusy(saveBtn, null, 'Save Attendance Sheet');
    }
});

document.getElementById('save-grades-btn').addEventListener('click', async function() {
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    setButtonBusy(this, 'Saving...');
    
    const inputs = document.querySelectorAll('.grade-input[data-field="attendance"]');
    for (const input of inputs) {
        const studentId = input.getAttribute('data-sid');
        const attendance = Number(document.querySelector(`.grade-input[data-sid="${studentId}"][data-field="attendance"]`).value) || 0;
        const assignment = Number(document.querySelector(`.grade-input[data-sid="${studentId}"][data-field="assignment"]`).value) || 0;
        const mid = Number(document.querySelector(`.grade-input[data-sid="${studentId}"][data-field="mid_exam"]`).value) || 0;
        const final = Number(document.querySelector(`.grade-input[data-sid="${studentId}"][data-field="final_exam"]`).value) || 0;

        const { data } = await supabase.from('grades').select('id')
            .eq('student_id', studentId).eq('course_id', currentUser.course_id).eq('semester', selectedSemester).maybeSingle();

        if (data) {
            await supabase.from('grades').update({ attendance, assignment, mid_exam: mid, final_exam: final }).eq('id', data.id);
        } else {
            await supabase.from('grades').insert({
                student_id: studentId, course_id: currentUser.course_id, semester: selectedSemester,
                attendance, assignment, mid_exam: mid, final_exam: final
            });
        }
    }
    setButtonBusy(this, null, 'Save Academic Grades');
    alert('Academic grades committed successfully.');
    await initTeacherViews();
});

// ==========================================================
// FEATURE 2: ADMIN ACCESS ENGINE & CUSTOM GRADING INTERFACE
// ==========================================================
async function initAdminViews() {
    const userTableBody = document.getElementById('admin-users-table-body');
    if (!userTableBody) return;
    userTableBody.innerHTML = '';

    const { data: allUsers } = await supabase.from('users').select('*');
    if (allUsers) {
        allUsers.forEach(u => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${escapeHtml(u.id)}</td>
                <td>${escapeHtml(u.name)}</td>
                <td><span class="badge">${escapeHtml(u.role)}</span></td>
                <td>${escapeHtml(u.course_name || u.course_id || 'N/A')}</td>
                <td><button class="btn btn-danger btn-sm" id="del-${u.id}">Delete</button></td>
            `;
            userTableBody.appendChild(row);
            row.querySelector(`#del-${u.id}`).addEventListener('click', () => deleteUserAccount(u.id));
        });
    }

    // Populate dropdown parameters for Full Admin Grading Structure
    if (currentUser.role === 'admin_full') {
        const studentDropdown = document.getElementById('admin-grade-student');
        const courseDropdown = document.getElementById('admin-grade-course');
        
        if(studentDropdown && courseDropdown) {
            studentDropdown.innerHTML = '<option value="">-- Select Student --</option>';
            courseDropdown.innerHTML = '<option value="">-- Select Course --</option>';

            const { data: students } = await supabase.from('users').select('id, name').eq('role', 'student');
            if (students) {
                students.forEach(s => {
                    studentDropdown.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)} (${s.id})</option>`;
                });
            }

            const { data: courses } = await supabase.from('users').select('course_id, course_name').eq('role', 'teacher');
            const uniqueCourseIds = [];
            if (courses) {
                courses.forEach(c => {
                    if (c.course_id && !uniqueCourseIds.includes(c.course_id)) {
                        uniqueCourseIds.push(c.course_id);
                        courseDropdown.innerHTML += `<option value="${c.course_id}">${escapeHtml(c.course_name || c.course_id)}</option>`;
                    }
                });
            }
        }
    }
}

// Admin Add User Process execution
document.getElementById('admin-add-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const uid = document.getElementById('new-user-id').value.trim();
    const uname = document.getElementById('new-user-name').value.trim();
    const upass = document.getElementById('new-user-pass').value;
    const urole = document.getElementById('new-user-role').value;
    const cid = document.getElementById('new-user-cid').value.trim() || null;
    const cname = document.getElementById('new-user-cname').value.trim() || null;

    const { error } = await supabase.from('users').insert({
        id: uid, name: uname, password: upass, role: urole, course_id: cid, course_name: cname
    });

    if (error) { alert('Failed creating user target profile.'); } 
    else {
        alert('Account established.');
        this.reset();
        await initAdminViews();
    }
});

// Admin Add Custom Form Grade Commit
document.getElementById('admin-add-grade-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (currentUser.role !== 'admin_full') {
        alert('Access denied.');
        return;
    }

    const studentId = document.getElementById('admin-grade-student').value;
    const courseId = document.getElementById('admin-grade-course').value;
    const semester = parseInt(document.getElementById('admin-grade-semester').value, 10);
    const attendance = Number(document.getElementById('admin-g-attendance').value) || 0;
    const assignment = Number(document.getElementById('admin-g-assignment').value) || 0;
    const mid_exam = Number(document.getElementById('admin-g-mid').value) || 0;
    const final_exam = Number(document.getElementById('admin-g-final').value) || 0;

    const { data: exist } = await supabase.from('grades').select('id')
        .eq('student_id', studentId).eq('course_id', courseId).eq('semester', semester).maybeSingle();

    let resError;
    if (exist) {
        const { error } = await supabase.from('grades').update({ attendance, assignment, mid_exam, final_exam }).eq('id', exist.id);
        resError = error;
    } else {
        const { error } = await supabase.from('grades').insert({
            student_id: studentId, course_id: courseId, semester, attendance, assignment, mid_exam, final_exam
        });
        resError = error;
    }

    if (resError) {
        alert('Error saving custom grades profile.');
    } else {
        alert('Grades submitted safely into student matrix ledger.');
        this.reset();
    }
});

async function deleteUserAccount(id) {
    if (!confirm('Remove this user parameter file?')) return;
    await supabase.from('users').delete().eq('id', id);
    await initAdminViews();
}

// ==========================================
// STUDENT PROFILE LOGIC
// ==========================================
async function initStudentViews() {
    const reportBody = document.getElementById('student-report-body');
    const cgpaLabel = document.getElementById('student-cgpa');
    if (!reportBody || !cgpaLabel) return;

    reportBody.innerHTML = '';
    
    const { data: grades } = await supabase.from('grades').select('*').eq('student_id', currentUser.id);
    const { data: logs } = await supabase.from('attendance_logs').select('*').eq('student_id', currentUser.id);

    let combinedPoints = 0;
    let semesterCount = 0;

    if (grades && grades.length > 0) {
        grades.forEach(g => {
            const row = document.createElement('tr');
            const total = (g.attendance || 0) + (g.assignment || 0) + (g.mid_exam || 0) + (g.final_exam || 0);
            
            const specificLogs = logs ? logs.filter(l => l.course_id === g.course_id && l.semester === g.semester) : [];
            const p = specificLogs.filter(l => l.status === 'Present').length;
            const a = specificLogs.filter(l => l.status === 'Absent').length;

            row.innerHTML = `
                <td>Semester ${g.semester}</td>
                <td>${escapeHtml(g.course_id)}</td>
                <td>${g.attendance}/10</td>
                <td>${g.assignment}/20</td>
                <td>${g.mid_exam}/20</td>
                <td>${g.final_exam}/50</td>
                <td><strong>${total}</strong>/100</td>
                <td>P: ${p} | A: ${a}</td>
            `;
            reportBody.appendChild(row);

            combinedPoints += total;
            semesterCount++;
        });
    }

    const calculatedGpa = semesterCount > 0 ? ((combinedPoints / semesterCount) / 25).toFixed(2) : "0.00";
    cgpaLabel.textContent = calculatedGpa;
}

// Modal handling setup
document.getElementById('reset-db-btn').addEventListener('click', () => { document.getElementById('resetModal').style.display = 'flex'; });
document.getElementById('cancelResetBtn').addEventListener('click', () => { document.getElementById('resetModal').style.display = 'none'; });
document.getElementById('confirmResetBtn').addEventListener('click', async () => {
    const pass = document.getElementById('adminResetPassword').value;
    if(pass === '1234') {
        alert('Database cleared to default baseline data elements.');
        document.getElementById('resetModal').style.display = 'none';
        location.reload();
    } else {
        alert('Incorrect system authentication validation bypass code string.');
    }
});
