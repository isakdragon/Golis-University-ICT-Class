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
            p_final_exam: parseFloat(document.getElementById
