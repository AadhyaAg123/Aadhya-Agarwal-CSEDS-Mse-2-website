// Brainhub 2.0 — all project data is saved locally in the browser.
const KEYS = {tasks:"bh2_tasks", sessions:"bh2_sessions", notes:"bh2_notes", goal:"bh2_goal", theme:"bh2_theme", focus:"bh2_focus"};
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
let tasks = read(KEYS.tasks, []);
let sessions = read(KEYS.sessions, []);
let notes = read(KEYS.notes, []);
let dailyGoal = read(KEYS.goal, 3);
let focusStats = read(KEYS.focus, {});
let activePage = "dashboard", taskFilter = "all", editingTask = null, editingNote = null;
let calendarDate = new Date(), selectedDate = dateKey(new Date());
let timerMode = "focus", timerDuration = 25 * 60, timerRemaining = timerDuration, timerInterval = null, timerRunning = false;
const $ = id => document.getElementById(id);
const todayKey = dateKey(new Date());
const quotes = [
  ["The secret of getting ahead is getting started.","Mark Twain"],
  ["It always seems impossible until it's done.","Nelson Mandela"],
  ["Great things are done by a series of small things brought together.","Vincent van Gogh"],
  ["Success is the sum of small efforts, repeated day in and day out.","Robert Collier"],
  ["You don't have to be perfect to make progress.","Unknown"]
];
function dateKey(date){ const d=new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function safeText(value){ return String(value ?? ""); }
function escapeHTML(value){ return safeText(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function toast(message){ const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove("show"),2100); }
function showModal(id){ $(id).classList.add("show"); }
function closeModal(id){ $(id).classList.remove("show"); }
function isOverdue(task){ return !task.completed && task.dueDate && task.dueDate < todayKey; }
function dateLabel(value){ if(!value)return "No due date"; return new Date(value+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short"}); }
function switchPage(page){
  activePage=page;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  $("crumbPage").textContent=({dashboard:"Dashboard",tasks:"My Tasks",planner:"Study Planner",focus:"Focus Room",notes:"My Notes"})[page];
  if(page==="planner") renderCalendar();
  if(page==="focus") renderFocusStats();
  if(page==="notes") renderNotes();
  if(page==="tasks") renderFullTasks();
  window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>switchPage(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>switchPage(b.dataset.go)));
document.querySelectorAll("[data-open-task]").forEach(b=>b.addEventListener("click",()=>openTaskModal()));
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
document.querySelectorAll(".modal-backdrop").forEach(back=>back.addEventListener("click",e=>{if(e.target===back)closeModal(back.id)}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal-backdrop.show").forEach(m=>closeModal(m.id));});

function renderStats(){
  const total=tasks.length, completed=tasks.filter(t=>t.completed).length, pending=total-completed, percent=total?Math.round(completed/total*100):0;
  $("statTotal").textContent=total; $("statPending").textContent=pending; $("statCompleted").textContent=completed; $("statProgress").textContent=percent+"%";
  $("statProgressBar").style.width=percent+"%"; $("progressCaption").textContent=total?`${completed} of ${total} tasks completed`:"Your day starts here";
  $("navTaskCount").textContent=pending; $("quickAll").textContent=total; $("quickPending").textContent=pending; $("quickCompleted").textContent=completed;
  $("countAll").textContent=total; $("countPending").textContent=pending; $("countCompleted").textContent=completed; $("countOverdue").textContent=tasks.filter(isOverdue).length;
  const doneToday=tasks.filter(t=>t.completed && t.completedAt && dateKey(t.completedAt)===todayKey).length;
  const pct=Math.min(100,Math.round(doneToday/dailyGoal*100));
  $("goalDone").textContent=doneToday; $("goalTarget").textContent=dailyGoal; $("goalTargetInput").value=dailyGoal; $("goalBar").style.width=pct+"%";
  $("goalMessage").textContent=pct>=100?"Amazing! You reached today's goal.":`${Math.max(0,dailyGoal-doneToday)} more task${dailyGoal-doneToday===1?"":"s"} to reach your daily goal.`;
}
function taskHTML(task, compact=false){
  const checked=task.completed?"checked":"";
  if(compact) return `<div class="compact-task ${task.completed?"done":""}"><button class="task-check ${checked}" data-toggle-task="${task.id}" aria-label="Toggle task">${task.completed?"✓":""}</button><div class="compact-task-info"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.category)} · ${dateLabel(task.dueDate)}</small></div><span class="priority ${task.priority}">${task.priority}</span></div>`;
  return `<article class="full-task ${task.completed?"done":""}"><button class="task-check ${checked}" data-toggle-task="${task.id}" aria-label="Toggle task">${task.completed?"✓":""}</button><div class="full-task-main"><strong>${escapeHTML(task.title)}</strong><p>${escapeHTML(task.description||"No description added")}</p></div><div class="task-detail-meta"><span class="category-chip">${escapeHTML(task.category)}</span><span class="priority ${task.priority}">${task.priority}</span></div><span class="due-label">${isOverdue(task)?"Overdue":dateLabel(task.dueDate)}</span><button class="task-action" data-edit-task="${task.id}" title="Edit">✎</button><button class="task-action" data-delete-task="${task.id}" title="Delete">⌫</button></article>`;
}
function renderDashboardTasks(){
  const list=$("dashboardTasks"), latest=[...tasks].sort((a,b)=>(a.completed-b.completed)||(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5);
  list.innerHTML=latest.map(t=>taskHTML(t,true)).join(""); $("dashboardEmpty").style.display=latest.length?"none":"block";
  renderStats(); renderWeeklyChart();
}
function renderFullTasks(){
  const search=$("taskSearch").value.trim().toLowerCase(), sort=$("sortTasks").value;
  let filtered=tasks.filter(t=>(taskFilter==="all"||(taskFilter==="pending"&&!t.completed)||(taskFilter==="completed"&&t.completed)||(taskFilter==="overdue"&&isOverdue(t)))&&(t.title.toLowerCase().includes(search)||t.description.toLowerCase().includes(search)||t.category.toLowerCase().includes(search)));
  if(sort==="newest")filtered.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  if(sort==="oldest")filtered.sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  if(sort==="priority"){const order={high:0,medium:1,low:2};filtered.sort((a,b)=>order[a.priority]-order[b.priority]);}
  if(sort==="due")filtered.sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
  $("fullTaskList").innerHTML=filtered.map(t=>taskHTML(t)).join(""); $("taskEmpty").style.display=filtered.length?"none":"block";
  document.querySelectorAll(".filter-tab").forEach(b=>b.classList.toggle("active",b.dataset.filter===taskFilter));
  renderStats();
}
function renderWeeklyChart(){
  const chart=$("weekChart"); chart.innerHTML=""; let total=0;
  const days=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=dateKey(d);const count=tasks.filter(t=>t.completed&&t.completedAt&&dateKey(t.completedAt)===key).length;days.push({key,label:d.toLocaleDateString("en-IN",{weekday:"short"}),count});total+=count;}
  const max=Math.max(1,...days.map(d=>d.count));
  days.forEach(d=>{const col=document.createElement("div");col.className="chart-day";const wrap=document.createElement("div");wrap.className="chart-bar-wrap";const bar=document.createElement("div");bar.className="chart-bar"+(d.key===todayKey?" today":"");bar.style.height=(d.count?Math.max(8,d.count/max*78):3)+"px";bar.title=`${d.count} completed`;wrap.append(bar);const label=document.createElement("small");label.textContent=d.label;col.append(wrap,label);chart.append(col);});
  $("weekTotal").textContent=`${total} completed`;
}
function setTaskFilter(filter){taskFilter=filter;switchPage("tasks");renderFullTasks();}
document.querySelectorAll("[data-task-filter]").forEach(b=>b.addEventListener("click",()=>setTaskFilter(b.dataset.taskFilter)));
document.querySelectorAll(".filter-tab").forEach(b=>b.addEventListener("click",()=>{taskFilter=b.dataset.filter;renderFullTasks();}));
$("taskSearch").addEventListener("input",renderFullTasks); $("sortTasks").addEventListener("change",renderFullTasks);
document.addEventListener("click",e=>{
  const toggle=e.target.closest("[data-toggle-task]"); if(toggle)toggleTask(toggle.dataset.toggleTask);
  const edit=e.target.closest("[data-edit-task]"); if(edit)openTaskModal(edit.dataset.editTask);
  const del=e.target.closest("[data-delete-task]"); if(del)deleteTask(del.dataset.deleteTask);
});
function toggleTask(id){tasks=tasks.map(t=>t.id===id?{...t,completed:!t.completed,completedAt:!t.completed?new Date().toISOString():null}:t);write(KEYS.tasks,tasks);renderDashboardTasks();renderFullTasks();toast("Task status updated");}
function deleteTask(id){if(!confirm("Delete this task?"))return;tasks=tasks.filter(t=>t.id!==id);write(KEYS.tasks,tasks);renderDashboardTasks();renderFullTasks();toast("Task deleted");}
function openTaskModal(id=null){
  editingTask=id; const task=tasks.find(t=>t.id===id);
  $("taskModalTitle").textContent=task?"Edit task":"Create a task";
  $("taskTitle").value=task?.title||"";$("taskDescription").value=task?.description||"";$("taskCategory").value=task?.category||"Study";$("taskPriority").value=task?.priority||"medium";$("taskDue").value=task?.dueDate||"";$("taskError").textContent="";
  showModal("taskModal");$("taskTitle").focus();
}
$("taskForm").addEventListener("submit",e=>{
  e.preventDefault();const title=$("taskTitle").value.trim();if(!title){$("taskError").textContent="Please enter a task name.";return;}
  const details={title,description:$("taskDescription").value.trim(),category:$("taskCategory").value,priority:$("taskPriority").value,dueDate:$("taskDue").value};
  if(editingTask){tasks=tasks.map(t=>t.id===editingTask?{...t,...details}:t);toast("Task updated");}
  else{tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),...details,completed:false,completedAt:null,createdAt:new Date().toISOString()});toast("Task created");}
  write(KEYS.tasks,tasks);closeModal("taskModal");renderDashboardTasks();renderFullTasks();
});
$("saveGoal").addEventListener("click",()=>{const value=Math.max(1,Math.min(30,Number($("goalTargetInput").value)||3));dailyGoal=value;write(KEYS.goal,dailyGoal);renderStats();toast("Daily goal updated");});
const quote=quotes[Math.floor(Math.random()*quotes.length)];$("quoteText").textContent=quote[0];$("quoteAuthor").textContent="— "+quote[1];
$("newQuote").addEventListener("click",()=>{const q=quotes[Math.floor(Math.random()*quotes.length)];$("quoteText").textContent=q[0];$("quoteAuthor").textContent="— "+q[1];});

// Calendar and study sessions
function renderCalendar(){
  const year=calendarDate.getFullYear(),month=calendarDate.getMonth();$("calendarMonth").textContent=calendarDate.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
  const first=new Date(year,month,1),start=first.getDay(),days=new Date(year,month+1,0).getDate(),prevDays=new Date(year,month,0).getDate();
  const cells=[];
  for(let i=0;i<42;i++){let day, date, muted=false;if(i<start){day=prevDays-start+i+1;date=new Date(year,month-1,day);muted=true;}else if(i>=start+days){day=i-(start+days)+1;date=new Date(year,month+1,day);muted=true;}else{day=i-start+1;date=new Date(year,month,day);}
    const key=dateKey(date),has=sessions.some(s=>s.date===key);cells.push(`<button class="calendar-day ${muted?"muted-day":""} ${key===todayKey?"today":""} ${key===selectedDate?"selected":""} ${has?"has-session":""}" data-calendar-date="${key}">${day}</button>`);
  }
  $("calendarDays").innerHTML=cells.join("");renderSessions();
}
function renderSessions(){
  const date=new Date(selectedDate+"T00:00:00");$("selectedDateTitle").textContent=date.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})+" sessions";
  const list=sessions.filter(s=>s.date===selectedDate).sort((a,b)=>a.time.localeCompare(b.time));
  $("sessionList").innerHTML=list.map(s=>`<div class="session-item"><div class="session-time">${escapeHTML(s.time)}</div><div class="session-info"><strong>${escapeHTML(s.name)}</strong><small>${s.duration} minutes</small></div><button class="session-delete" data-delete-session="${s.id}" title="Delete session">×</button></div>`).join("");
  $("sessionEmpty").style.display=list.length?"none":"block";
}
$("calendarDays").addEventListener("click",e=>{const b=e.target.closest("[data-calendar-date]");if(b){selectedDate=b.dataset.calendarDate;renderCalendar();}});
$("prevMonth").addEventListener("click",()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar();});
$("nextMonth").addEventListener("click",()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar();});
$("addSession").addEventListener("click",()=>{$("sessionDate").value=selectedDate;$("sessionName").value="";$("sessionError").textContent="";showModal("sessionModal");});
$("sessionForm").addEventListener("submit",e=>{e.preventDefault();const name=$("sessionName").value.trim();if(!name){$("sessionError").textContent="Enter a subject or session name.";return;}sessions.push({id:String(Date.now()),name,date:$("sessionDate").value,time:$("sessionTime").value,duration:Number($("sessionDuration").value)});write(KEYS.sessions,sessions);selectedDate=$("sessionDate").value;calendarDate=new Date(selectedDate+"T00:00:00");closeModal("sessionModal");renderCalendar();toast("Study session added");});
document.addEventListener("click",e=>{const b=e.target.closest("[data-delete-session]");if(b){sessions=sessions.filter(s=>s.id!==b.dataset.deleteSession);write(KEYS.sessions,sessions);renderCalendar();toast("Session removed");}});

// Pomodoro focus timer
function updateTimer(){const min=Math.floor(timerRemaining/60),sec=timerRemaining%60;$("timerDisplay").textContent=String(min).padStart(2,"0")+":"+String(sec).padStart(2,"0");const progress=(timerDuration-timerRemaining)/timerDuration;$("timerRing").style.background=`conic-gradient(var(--purple) ${progress*360}deg,#efedf8 ${progress*360}deg)`;}
function chooseTimer(mode,minutes){pauseTimer();timerMode=mode;timerDuration=minutes*60;timerRemaining=timerDuration;$("timerModeLabel").textContent=mode==="focus"?"Time to focus":mode==="short"?"Take a breather":"Recharge and reset";$("timerStart").textContent="Start "+(mode==="focus"?"focus":"break");document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));updateTimer();}
function pauseTimer(){if(timerInterval)clearInterval(timerInterval);timerInterval=null;timerRunning=false;}
$("timerStart").addEventListener("click",()=>{if(timerRunning){pauseTimer();$("timerStart").textContent="Resume";return;}timerRunning=true;$("timerStart").textContent="Pause";timerInterval=setInterval(()=>{timerRemaining--;updateTimer();if(timerRemaining<=0){pauseTimer();$("timerStart").textContent="Start again";if(timerMode==="focus"){const stats=read(KEYS.focus,{});const day=stats[todayKey]||{sessions:0,minutes:0};day.sessions++;day.minutes+=Math.round(timerDuration/60);stats[todayKey]=day;write(KEYS.focus,stats);renderFocusStats();}toast(timerMode==="focus"?"Focus session complete. Well done!":"Break finished. Ready to focus?");try{if("Notification"in window&&Notification.permission==="granted")new Notification("Brainhub",{body:"Your timer is complete."});}catch{} }} ,1000);});
$("timerReset").addEventListener("click",()=>{pauseTimer();timerRemaining=timerDuration;$("timerStart").textContent="Start "+(timerMode==="focus"?"focus":"break");updateTimer();});
document.querySelectorAll(".mode").forEach(b=>b.addEventListener("click",()=>chooseTimer(b.dataset.mode,Number(b.dataset.minutes))));
function renderFocusStats(){const stats=focusStats[todayKey]||{sessions:0,minutes:0};$("focusSessions").textContent=stats.sessions;$("focusMinutes").textContent=stats.minutes+" min";}

// Notes
function renderNotes(){
  const search=$("noteSearch").value.trim().toLowerCase();const filtered=notes.filter(n=>(n.title+" "+n.content).toLowerCase().includes(search));
  $("notesGrid").innerHTML=filtered.map(n=>`<article class="note-card"><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.content)}</p><footer><span>${new Date(n.updatedAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</span><span class="note-actions"><button data-edit-note="${n.id}" title="Edit note">✎</button><button data-delete-note="${n.id}" title="Delete note">⌫</button></span></footer></article>`).join("");
  $("notesEmpty").style.display=filtered.length?"none":"block";$("noteCount").textContent=`${notes.length} note${notes.length===1?"":"s"}`;
}
function openNote(id=null){editingNote=id;const n=notes.find(x=>x.id===id);$("noteModalTitle").textContent=n?"Edit note":"New note";$("noteTitle").value=n?.title||"";$("noteContent").value=n?.content||"";$("noteError").textContent="";showModal("noteModal");$("noteTitle").focus();}
$("addNote").addEventListener("click",()=>openNote());$("emptyNote").addEventListener("click",()=>openNote());$("noteSearch").addEventListener("input",renderNotes);
$("noteForm").addEventListener("submit",e=>{e.preventDefault();const title=$("noteTitle").value.trim();if(!title){$("noteError").textContent="Please add a title.";return;}const data={title,content:$("noteContent").value.trim(),updatedAt:new Date().toISOString()};if(editingNote)notes=notes.map(n=>n.id===editingNote?{...n,...data}:n);else notes.unshift({id:String(Date.now()),...data});write(KEYS.notes,notes);closeModal("noteModal");renderNotes();toast(editingNote?"Note updated":"Note saved");});
document.addEventListener("click",e=>{const edit=e.target.closest("[data-edit-note]");if(edit)openNote(edit.dataset.editNote);const del=e.target.closest("[data-delete-note]");if(del&&confirm("Delete this note?")){notes=notes.filter(n=>n.id!==del.dataset.deleteNote);write(KEYS.notes,notes);renderNotes();toast("Note deleted");}});

// Theme, greeting, date and optional browser notifications.
$("themeToggle").addEventListener("click",()=>{document.body.classList.toggle("dark");write(KEYS.theme,document.body.classList.contains("dark"));});
if(read(KEYS.theme,false))document.body.classList.add("dark");
const hour=new Date().getHours();$("welcomeTitle").innerHTML=(hour<12?"Good morning.":hour<18?"Good afternoon.":"Good evening.")+" <span>Let's focus.</span>";
$("headerDate").textContent=new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
if(!localStorage.getItem(KEYS.tasks)){
  tasks=[
    {id:"demo-a",title:"Revise arrays and strings",description:"Practice important programming questions",category:"Study",priority:"high",dueDate:"",completed:false,createdAt:new Date().toISOString()},
    {id:"demo-b",title:"Complete web technology notes",description:"Review HTML, CSS and JavaScript concepts",category:"Assignment",priority:"medium",dueDate:"",completed:false,createdAt:new Date(Date.now()-1000).toISOString()},
    {id:"demo-c",title:"Organize study timetable",description:"Plan focused study sessions for the week",category:"Personal",priority:"low",dueDate:"",completed:true,completedAt:new Date().toISOString(),createdAt:new Date(Date.now()-2000).toISOString()}
  ];write(KEYS.tasks,tasks);
}
$("goalTarget").textContent=dailyGoal;
renderDashboardTasks();renderFullTasks();renderCalendar();renderFocusStats();updateTimer();
