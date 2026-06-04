import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mxdplsijbisozgzamugg.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZHBsc2lqYmlzb3pnemFtdWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMjU3NDIsImV4cCI6MjA5NTkwMTc0Mn0.25HVUu80WkEoqfPdYkIUeE_wjg4o3Aa3JOWEzuDQDEE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentAttendanceState = {}; 

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const idInput = document.getElementById('username').value.trim();
    const passInput = document.getElementById('password').value;
    const errorDisplay = document.getElementById('login-error');

    errorDisplay.textContent = "Connecting to secure database...";

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', idInput)
        .eq('password', passInput)
        .maybeSingle();

    if (error) {
        errorDisplay.textContent = "Database connection error. Please try again.";
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

async function setupDashboardView() {
    try {
        document.querySelectorAll('.dashboard-view').forEach(view => view.classList.add('hidden'));
        
        const welcomeText = document.getElementById('welcome-text');
        const roleBadge = document.getElementById('user-role-badge');
        
        if (welcomeText) welcomeText.textContent = `Welcome, ${currentUser.name}`;
        if (roleBadge) roleBadge.textContent = currentUser.role;

        const normalizedRole = (currentUser.role || '').toLowerCase().trim();

        if (normalizedRole === 'admin') {
            const adminDash = document.getElementById('admin-dashboard');
            if (adminDash) {
                adminDash.classList.remove('hidden');
                await window.initAdminViews(); 
            }
        } else if (normalizedRole === 'teacher') {
            const teacherDash = document.getElementById('teacher-dashboard');
            if (teacherDash) {
                teacherDash.classList.remove('hidden');
                
                const courseNameEl = document.getElementById('teacher-course-name');
                if (courseNameEl) {
                    courseNameEl.textContent = currentUser.course_name || "Unassigned";
                }
                
                await window.initTeacherViews();
            }
        } else if (normalizedRole === 'student') {
            const studentDash = document.getElementById('student-dashboard');
            if (studentDash) {
                studentDash.classList.remove('hidden');
                await window.initStudentViews();
            }
        }
    } catch (err) {}
}

window.switchTeacherTab = function(tabId, eventObject = null) {
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');
    
    const activeEvent = eventObject || window.event;
    if (activeEvent && activeEvent.currentTarget) {
        activeEvent.currentTarget.classList.add('active');
    }
}

window.initTeacherViews = async function() {
    try {
        const attendanceTableBody = document.getElementById('attendance-table-body');
        const gradesTableBody = document.getElementById('grades-table-body');
        const semesterSelect = document.getElementById('teacher-semester-select');
        const attendanceDateInput = document.getElementById('attendance-date');

        if (!attendanceTableBody || !gradesTableBody || !semesterSelect || !attendanceDateInput) return;
        
        const selectedSemester = parseInt(semesterSelect.value) || 4;
        attendanceDateInput.value = new Date().toISOString().split('T')[0];

        attendanceTableBody.innerHTML = '';
        gradesTableBody.innerHTML = '';
        currentAttendanceState = {};

        const { data: students, error: studentErr } = await supabase
            .from('users')
            .select('id, name')
            .eq('role', 'student');

        if (studentErr || !students || students.length === 0) return;

        const { data: gradesList } = await supabase
            .from('grades')
            .select('*')
            .eq('course_id', currentUser.course_id)
            .eq('semester', selectedSemester);

        const { data: courseLogs } = await supabase
            .from('attendance_logs')
            .select('*')
            .eq('course_id', currentUser.course_id);

        students.forEach(student => {
            currentAttendanceState[student.id] = 'Present';

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

            const exactGrade = (gradesList && gradesList.find(g => g.student_id === student.id)) || {
                attendance: 0, assignment: 0, mid_exam: 0, final_exam: 0
            };

            const totalScore = window.calculateRowTotal(exactGrade);

            const studentCourseLogs = courseLogs ? courseLogs.filter(l => l.student_id === student.id && (!l.semester || l.semester === selectedSemester)) : [];
            const totalP = studentCourseLogs.filter(l => l.status === 'Present').length;
            const totalA = studentCourseLogs.filter(l => l.status === 'Absent').length;
            const recordStr = `<span style="color:green; font-weight:600;">P: ${totalP}</span> | <span style="color:red; font-weight:600;">A: ${totalA}</span>`;

            const gradeRow = document.createElement('tr');
            gradeRow.innerHTML = `
                <td>${student.id}</td>
                <td>${student.name}</td>
                <td>${recordStr}</td> 
                <td><input type="number" min="0" max="10" value="${exactGrade.attendance || 0}" class="grade-input" data-sid="${student.id}" data-field="attendance" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.assignment || 0}" class="grade-input" data-sid="${student.id}" data-field="assignment" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="20" value="${exactGrade.mid_exam || 0}" class="grade-input" data-sid="${student.id}" data-field="mid_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><input type="number" min="0" max="50" value="${exactGrade.final_exam || 0}" class="grade-input" data-sid="${student.id}" data-field="final_exam" oninput="updateGradeTotalDisplay(this)"></td>
                <td><strong id="total-${student.id}">${totalScore}</strong>/100</td>
            `;
            gradesTableBody.appendChild(gradeRow);
        });
    } catch (err) {}
}

window.setAttendanceStatus = function(studentId, status) {
    currentAttendanceState[studentId] = status;
    const pBtn = document.getElementById(`p-${studentId}`);
    const aBtn = document.getElementById(`a-${studentId}`);
    
    if (pBtn && aBtn) {
        pBtn.classList.remove('active-present');
        aBtn.classList.remove('active-absent');
        
        if (status === 'Present') {
            pBtn.classList.add('active-present');
        } else {
            aBtn.classList.add('active-absent');
        }
    }
};

window.calculateRowTotal = function(gradeData) {
    const attendance = parseFloat(gradeData.attendance) || 0;
    const assignment = parseFloat(gradeData.assignment) || 0;
    const midExam = parseFloat(gradeData.mid_exam) || 0;
    const finalExam = parseFloat(gradeData.final_exam) || 0;
    return attendance + assignment + midExam + finalExam;
};

window.updateGradeTotalDisplay = function(inputElement) {
    const studentId = inputElement.getAttribute('data-sid');
    const row = inputElement.closest('tr');
    
    const att = parseFloat(row.querySelector('input[data-field="attendance"]').value) || 0;
    const ass = parseFloat(row.querySelector('input[data-field="assignment"]').value) || 0;
    const mid = parseFloat(row.querySelector('input[data-field="mid_exam"]').value) || 0;
    const fin = parseFloat(row.querySelector('input[data-field="final_exam"]').value) || 0;
    
    const total = att + ass + mid + fin;
    
    const totalElement = document.getElementById(`total-${studentId}`);
    if (totalElement) {
        totalElement.textContent = total;
    }
};

window.toggleAdminCourseFields = function() {
    const roleSelect = document.getElementById('new-user-role');
    const courseFields = document.getElementById('admin-course-fields');
    
    if (roleSelect && courseFields) {
        if (roleSelect.value === 'teacher') {
            courseFields.classList.remove('hidden');
        } else {
            courseFields.classList.add('hidden');
        }
    }
};

window.initAdminViews = async function() {
    try {
        const tbody = document.getElementById('admin-users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const { data: users, error } = await supabase.from('users').select('*');
        if (error) return;

        users.forEach(user => {
            const tr = document.createElement('tr');
            
            let deleteBtnHTML = '';
            if (user.id === currentUser.id) {
                deleteBtnHTML = `<small style="color: gray; font-style: italic;">Active Session</small>`;
            } else {
                deleteBtnHTML = `<button class="btn btn-danger delete-user-btn" style="padding: 4px 8px; font-size: 12px;" data-userid="${user.id}">Delete</button>`;
            }

            tr.innerHTML = `
                <td>${user.id}</td>
                <td>${user.name}</td>
                <td>${user.role}</td>
                <td>${user.course_name || 'N/A'}</td>
                <td>${deleteBtnHTML}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {}
};

window.initStudentViews = async function() {
    const tbody = document.getElementById('student-report-body');
    const cgpaDisplay = document.getElementById('student-cgpa');
    if (!tbody || !cgpaDisplay) return;
    
    tbody.innerHTML = '';
    
    const { data: grades, error } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', currentUser.id);
        
    if (error || !grades) return;

    let totalScoreAllSemesters = 0;
    
    grades.forEach(grade => {
        const totalScore = window.calculateRowTotal(grade);
        totalScoreAllSemesters += totalScore;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Semester ${grade.semester || 'N/A'}</td>
            <td>${grade.course_name || 'N/A'}</td>
            <td>${grade.attendance || 0}/10</td>
            <td>${grade.assignment || 0}/20</td>
            <td>${grade.mid_exam || 0}/20</td>
            <td>${grade.final_exam || 0}/50</td>
            <td>${totalScore}/100</td>
            <td>Logged</td>
        `;
        tbody.appendChild(tr);
    });

    const average = grades.length > 0 ? (totalScoreAllSemesters / grades.length) : 0;
    const cgpa = (average / 100) * 4.0;
    cgpaDisplay.textContent = cgpa.toFixed(2);
};

document.addEventListener('click', async function(e) {
    if (e.target && e.target.classList.contains('delete-user-btn')) {
        const userId = e.target.getAttribute('data-userid');
        
        if (!confirm(`Are you sure you want to permanently delete user ID: ${userId}?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('users')
                .delete()
                .eq('id', userId);

            if (error) {
                alert(`Could not delete user: ${error.message}`);
                return;
            }

            alert("User account successfully removed.");
            await window.initAdminViews();
            
        } catch (err) {
            alert("An unexpected error occurred while deleting the user.");
        }
    }
});
