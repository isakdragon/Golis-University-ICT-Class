import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mxdplsijbisozgzamugg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAttendanceState = {};

// ==========================================
// SECURITY NOTE
// ==========================================
// This demo authenticates by comparing a plaintext password column directly
// from the client, and re-sends that plaintext password as an RPC argument
// on every save. That's fine for a classroom demo with a throwaway anon key,
// but if this is ever pointed at real student data, move auth to Supabase
// Auth (or at least hash passwords server-side) and use RLS policies tied
// to auth.uid() instead of trusting whatever the client claims its role is.

// ==========================================
// SMALL UTILITIES
// ==========================================

// Escapes text before it's dropped into innerHTML, so a name/ID containing
// "<" or "&" can't break the page or inject a script.
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
        if (roleBadge) roleBadge.textContent = currentUser.role;

        const normalizedRole = (currentUser.role || '').toLowerCase().trim();

        if (normalizedRole === 'admin') {
            const adminDash = document.getElementById('admin-dashboard');
            if (adminDash) {
                adminDash.classList.remove('hidden');
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

// Tab switching now always receives the click event explicitly instead of
// falling back to the deprecated/unreliable global window.event.
window.switchTeacherTab = function (tabId, event) {
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');

    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
};

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

        if (studentErr) {
            console.error(studentErr);
            return;
        }
        if (!students || students.length === 0) return;

        const { data: gradesList } = await supabase
            .from('grades')
            .select('*')
            .eq('course_id', currentUser.course_id)
            .eq('semester', selectedSemester);

        // Attendance logs for this course, used both for the P/A history
        // column and to restore today's toggle state below.
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

        // Restore the Present/Absent toggle to match whatever was already
        // saved for the date currently shown, instead of always showing
        // everyone as "Present" even if absences were saved earlier.
        await loadAttendanceForDate(attendanceDateInput.value, courseLogs);

        // Re-load whenever the teacher picks a different date, so the
        // toggles reflect that day's saved record (if any).
        attendanceDateInput.onchange = () => loadAttendanceForDate(attendanceDateInput.value, courseLogs);
    } catch (err) {
        console.error('Runtime view rendering crashed:', err);
    }
};

// Applies saved attendance (if any) for the given date to the on-screen
// toggle buttons. Falls back to "Present" for students with no saved log.
async function loadAttendanceForDate(date, preloadedLogs) {
    if (!date) return;

    let logsForDate = (preloadedLogs || []).filter((l) => l.date === date);

    // If we don't already have logs in memory for this date (e.g. the
    // teacher switched dates after initial load), fetch them.
    if (logsForDate.length === 0) {
        const { data: fetchedLogs, error } = await supabase
            .from('attendance_logs')
            .select('student_id, status, date')
            .eq('course_id', currentUser.course_id)
            .eq('date', date);
        if (error) {
            console.error(error);
            return;
        }
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

document.getElementById('save-attendance-btn').addEventListener('click', async function () {
    const dateSelected = document.getElementById('attendance-date').value;
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const saveBtn = this;

    if (!dateSelected) {
        alert('Please pick a valid calendar tracking date.');
        return;
    }

    const newLogs = Object.entries(currentAttendanceState).map(([studentId, status]) => ({
        student_id: studentId,
        status
    }));

    setButtonBusy(saveBtn, 'Saving...');
    try {
        const { error } = await supabase.rpc('secure_teacher_save_attendance', {
            teacher_id: currentUser.id,
            teacher_pass: currentUser.password,
            p_date: dateSelected,
            p_course_id: currentUser.course_id,
            p_semester: selectedSemester,
            log_data: newLogs
        });

        if (error) {
            alert('Error saving attendance: ' + error.message);
        } else {
            alert(`Attendance successfully stored for ${dateSelected}!`);
            await initTeacherViews();
        }
    } finally {
        setButtonBusy(saveBtn, null, 'Save Attendance Sheet');
    }
});

document.getElementById('save-grades-btn').addEventListener('click', async function () {
    const selectedSemester = parseInt(document.getElementById('teacher-semester-select').value, 10) || 4;
    const saveBtn = this;
    const studentIds = [...new Set([...document.querySelectorAll('.grade-input')].map((i) => i.getAttribute('data-sid')))];

    const gradesArray = studentIds.map((studentId) => {
        const rowInputs = document.querySelectorAll(`.grade-input[data-sid="${studentId}"]`);
        const gradeObj = { student_id: studentId };
        rowInputs.forEach((input) => {
            gradeObj[input.getAttribute('data-field')] = Number(input.value) || 0;
        });
        return gradeObj;
    });

    setButtonBusy(saveBtn, 'Saving...');
    try {
        const { error } = await supabase.rpc('secure_teacher_save_grades', {
            teacher_id: currentUser.id,
            teacher_pass: currentUser.password,
            p_course_id: currentUser.course_id,
            p_course_name: currentUser.course_name,
            p_semester: selectedSemester,
            grade_data: gradesArray
        });

        if (error) {
            alert('Error saving grades: ' + error.message);
        } else {
            alert('Course marks and grades securely saved!');
        }
    } finally {
        setButtonBusy(saveBtn, null, 'Save Academic Grades');
    }
});

// ==========================================
// STUDENT DASHBOARD
// ==========================================

async function initStudentViews() {
    const studentReportBody = document.getElementById('student-report-body');
    if (!studentReportBody) return;
    studentReportBody.innerHTML = '';

    try {
        const { data: studentGrades, error: gradesErr } = await supabase.from('grades').select('*').eq('student_id', currentUser.id);
        const { data: studentLogs, error: logsErr } = await supabase.from('attendance_logs').select('*').eq('student_id', currentUser.id);

        if (gradesErr || logsErr) {
            console.error(gradesErr || logsErr);
            studentReportBody.innerHTML = '<tr><td colspan="8">Unable to load your academic record right now.</td></tr>';
            return;
        }

        let totalPointsAcrossSemesters = 0;
        let totalCoursesCount = 0;

        (studentGrades || []).forEach((grade) => {
            const totalScore = calculateRowTotal(grade);

            const courseAttendanceLogs = studentLogs
                ? studentLogs.filter((l) => l.course_id === grade.course_id && (!l.semester || l.semester === grade.semester))
                : [];

            const totalP = courseAttendanceLogs.filter((l) => l.status === 'Present').length;
            const totalA = courseAttendanceLogs.filter((l) => l.status === 'Absent').length;

            const gpaPoints = calculateGPAValue(totalScore);
            totalPointsAcrossSemesters += gpaPoints;
            totalCoursesCount++;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>Semester ${escapeHtml(grade.semester)}</td>
                <td><strong>${escapeHtml(grade.course_name || 'General')}</strong></td>
                <td>${grade.attendance} / 10</td>
                <td>${grade.assignment} / 20</td>
                <td>${grade.mid_exam} / 20</td>
                <td>${grade.final_exam} / 50</td>
                <td><strong>${totalScore}</strong> (${gpaPoints.toFixed(2)} GP)</td>
                <td><span style="color:green;">P: ${totalP}</span> | <span style="color:red;">A: ${totalA}</span></td>
            `;
            studentReportBody.appendChild(tr);
        });

        const cumulativeGPA = totalCoursesCount > 0 ? (totalPointsAcrossSemesters / totalCoursesCount) : 0.00;
        document.getElementById('student-cgpa').textContent = cumulativeGPA.toFixed(2);
    } catch (err) {
        console.error('Failed to build student report:', err);
    }
}

function calculateGPAValue(score) {
    if (score >= 90) return 4.00;
    if (score >= 80) return 3.50;
    if (score >= 70) return 3.00;
    if (score >= 60) return 2.50;
    if (score >= 50) return 2.00;
    return 0.00;
}

// =================================================
// ADMIN: SECURE DEMO-DATA RESET (PASSWORD-CONFIRMED MODAL)
// =================================================
const resetBtn = document.getElementById('reset-db-btn');
const resetModal = document.getElementById('resetModal');
const cancelResetBtn = document.getElementById('cancelResetBtn');
const confirmResetBtn = document.getElementById('confirmResetBtn');
const passwordInput = document.getElementById('adminResetPassword');

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        if (resetModal) {
            resetModal.style.display = 'flex';
            if (passwordInput) passwordInput.value = '';
        }
    });
}

if (cancelResetBtn) {
    cancelResetBtn.addEventListener('click', () => {
        if (resetModal) resetModal.style.display = 'none';
    });
}

if (confirmResetBtn) {
    confirmResetBtn.addEventListener('click', async () => {
        const enteredPassword = passwordInput ? passwordInput.value : '';

        if (!enteredPassword) {
            alert('Please enter a password.');
            return;
        }

        setButtonBusy(confirmResetBtn, 'Resetting...');

        try {
            const { data, error } = await supabase.rpc('reset_system_to_demo', {
                entered_password: enteredPassword
            });

            if (error) {
                alert(`Reset Failed: ${error.message}`);
                if (passwordInput) passwordInput.value = '';
            } else if (data === true) {
                alert('System successfully reset to demo defaults!');
                if (resetModal) resetModal.style.display = 'none';
                window.location.reload();
            } else {
                alert('Incorrect password.');
                if (passwordInput) passwordInput.value = '';
            }
        } catch (err) {
            console.error('Unexpected error during database reset execution:', err);
            alert('An unexpected error occurred during reset.');
        } finally {
            setButtonBusy(confirmResetBtn, null, 'Confirm Reset');
        }
    });
}

// =================================================
// ADMIN: USER MANAGEMENT
// =================================================

async function initAdminViews() {
    const adminUsersTableBody = document.getElementById('admin-users-table-body');
    if (!adminUsersTableBody) return;
    adminUsersTableBody.innerHTML = '';

    const { data: users, error } = await supabase.from('users').select('*');
    if (error) {
        console.error(error);
        adminUsersTableBody.innerHTML = '<tr><td colspan="5">Unable to load users right now.</td></tr>';
        return;
    }

    (users || []).forEach((user) => {
        const tr = document.createElement('tr');
        const safeId = escapeHtml(user.id);
        const safeName = escapeHtml(user.name);
        const safeRole = escapeHtml(user.role);
        const courseDetails = user.role === 'teacher'
            ? `${escapeHtml(user.course_name)} (${escapeHtml(user.course_id)})`
            : '-';

        const deleteBtn = user.id === currentUser.id
            ? '<small style="color: gray; font-style: italic;">Active Session</small>'
            : `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteUser('${safeId}')">Delete</button>`;

        const roleColors = {
            admin: { bg: '#fef3c7', text: '#92400e' },
            teacher: { bg: '#dcfce7', text: '#166534' },
            student: { bg: '#dbeafe', text: '#1e40af' }
        };
        const colors = roleColors[user.role] || roleColors.student;

        tr.innerHTML = `
            <td><strong>${safeId}</strong></td>
            <td>${safeName}</td>
            <td><span class="badge" style="background:${colors.bg}; color:${colors.text};">${safeRole}</span></td>
            <td>${courseDetails}</td>
            <td>${deleteBtn}</td>
        `;
        adminUsersTableBody.appendChild(tr);
    });
}

window.toggleAdminCourseFields = function () {
    const roleSelected = document.getElementById('new-user-role').value;
    const courseFields = document.getElementById('admin-course-fields');
    if (roleSelected === 'teacher') {
        courseFields.classList.remove('hidden');
    } else {
        courseFields.classList.add('hidden');
    }
};

document.getElementById('admin-add-user-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');

    const id = document.getElementById('new-user-id').value.trim();
    const name = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pass').value;
    const role = document.getElementById('new-user-role').value;
    const courseId = role === 'teacher' ? document.getElementById('new-user-cid').value.trim() : null;
    const courseName = role === 'teacher' ? document.getElementById('new-user-cname').value.trim() : null;

    if (role === 'teacher' && (!courseId || !courseName)) {
        alert('Please provide both a Course ID and Course Name for a teacher account.');
        return;
    }

    setButtonBusy(submitBtn, 'Creating...');
    try {
        const { data: existingUser, error: lookupErr } = await supabase
            .from('users')
            .select('id')
            .eq('id', id)
            .maybeSingle();

        if (lookupErr) {
            alert('Database error: ' + lookupErr.message);
            return;
        }

        if (existingUser) {
            alert('This User ID already exists in the system.');
            return;
        }

        const { error } = await supabase.from('users').insert([{
            id, name, password, role,
            course_id: courseId,
            course_name: courseName
        }]);

        if (error) {
            alert('Database error: ' + error.message);
        } else {
            alert('User account successfully created.');
            form.reset();
            document.getElementById('admin-course-fields').classList.add('hidden');
            await initAdminViews();
        }
    } finally {
        setButtonBusy(submitBtn, null, 'Create User Account');
    }
});

window.deleteUser = async function (userId) {
    if (!confirm(`Are you sure you want to permanently delete user ID: ${userId}?`)) {
        return;
    }

    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) {
            // Catches foreign key errors (e.g. the user still has grades/logs attached)
            alert(`Could not delete user: ${error.message}`);
            return;
        }

        alert('User account successfully removed.');
        await initAdminViews();
    } catch (err) {
        console.error('Critical error during deletion routing:', err);
        alert('An unexpected error occurred while deleting the user.');
    }
};
