const firebaseConfig = {
    apiKey: "AIzaSyBWIrVJdPMtBgm220vfSo0hUSp8sZanIRw",
    authDomain: "bellhacks-edf19.firebaseapp.com",
    projectId: "bellhacks-edf19",
    storageBucket: "bellhacks-edf19.firebasestorage.app",
    messagingSenderId: "115563550066",
    appId: "1:115563550066:web:a7ec680e4f78b53e3439eb",
    measurementId: "G-RQTZJR47RL"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();
const db = firebase.firestore();

const INTEREST_TAGS = ["STEM", "Humanities", "School", "Business", "Leadership", "Visual Arts", "Media", "Cultural"];


let currentDate = new Date();
let currentView = 'my_feed';
let allClubsData = [];
let clubColorMap = {};
let currentUser = null;
let unsubscribeListener;
//HIDE API KEY IF WE PUBLISH TO GIT!!!
const OPENAI_API_KEY = "MYAPIKEY"
const calendarprovider = new firebase.auth.GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/tasks');

let googleAccessToken = localStorage.getItem('google_access_token');
if (googleAccessToken) {
    console.log("Restored Google Access Token from storage.");
}


document.addEventListener('DOMContentLoaded', async () => {
    if (document.getElementById('finish-onboarding-btn')) {
        document.getElementById('finish-onboarding-btn').addEventListener('click', saveOnboarding);
    }
    document.getElementById('google-login-btn').addEventListener('click', handleLogin);


    allClubsData = await fetchClubsFromFirebase();
    setupRealtimeListener();
    setupClubColorListener();

    //IF ALREADY LOGGED IN THEN DON'T LOGIN!
    auth.onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
            console.log("User detected:", firebaseUser.email);
            await checkUserStatus(firebaseUser);
        } else {
            // No user, show login overlay
            document.getElementById('login-overlay').style.display = 'flex';
        }
    });



    const directoryContainer = document.getElementById('clubs-directory');

    if (directoryContainer) {
        // If yes, load the club list!
        renderClubDirectory();
    } else {
        // If no, we are on the Calendar page
        renderCalendar();
    }
});


// Logout Llistener
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('google_access_token');
    firebase.auth().signOut().then(() => {
        console.log("User signed out");


        window.location.reload();
    });
});
async function handleLogin() {
    try {
        const result = await auth.signInWithPopup(provider);
        googleAccessToken = result.credential.accessToken;
        localStorage.setItem('google_access_token', googleAccessToken);
        console.log(googleAccessToken);
    } catch (error) {
        console.error("Login failed:", error);
        showToast("Login failed. Check console.")
 
    }
}
async function checkUserStatus(firebaseUser) {
    const userRef = db.collection('users').doc(firebaseUser.uid);
    const doc = await userRef.get();

    if (doc.exists) {
        // --- RETURNING USER ---
        console.log("Welcome back!");
        currentUser = doc.data();
        currentUser.uid = firebaseUser.uid; // Store UID for later use
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('onboarding-overlay').style.display = 'none';

        let addBtn = document.getElementById('admin-add-btn');
        document.getElementById('profile-btn').style.display = 'block';
        document.getElementById('logout-btn').style.display = 'block';

        if (currentUser && currentUser.isAdmin === true) {
            addBtn.style.display = 'block'; // SHOW BUTTON
            document.getElementById("eventClub").value = currentUser.CLUBOFFICER;
        } else {
            addBtn.style.display = 'none';  // HIDE BUTTON
        }
        renderCalendar();
    }
    else {
        console.log("New user! Starting onboarding...");
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('onboarding-overlay').style.display = 'flex';

        //Choosing tags for new users the club interests
        renderOnboardingTools();
    }
}

function renderOnboardingTools() {
    const tagContainer = document.getElementById('tag-container');
    const clubList = document.getElementById('club-selection-list');

    tagContainer.innerHTML = '';
    clubList.innerHTML = '';
    //Overarching tags
    INTEREST_TAGS.forEach(tag => {
        const btn = document.createElement('div');
        btn.className = 'tag-btn';
        btn.innerText = tag;
        btn.onclick = () => selectClubsByTag(tag, btn);
        tagContainer.appendChild(btn);
    });

    // B. Create All Club Checkboxes
    allClubsData.forEach(club => {
        const div = document.createElement('div');
        div.className = 'club-item';

        // We add a 'data-tags' attribute to make filtering easy later
        // Note: club.tags comes from your fetchClubsFromFirebase function
        const tagString = club.tags ? club.tags.join(',') : "";

        div.innerHTML = `
            <input type="checkbox" id="chk-${club.name}" value="${club.name}" data-tags="${tagString}">
            <label for="chk-${club.name}">${club.name}</label>
        `;
        clubList.appendChild(div);
    });
}


function selectClubsByTag(tag, btnElement) {
    // 1. Toggle the visual state of the TAG
    btnElement.classList.toggle('selected');
    const isSelected = btnElement.classList.contains('selected');

    // 2. Find all club checkboxes in the list
    const checkboxes = document.querySelectorAll('#club-selection-list input');

    checkboxes.forEach(chk => {
        const clubTagsString = chk.getAttribute('data-tags');
        // Split string "STEM,Coding" into array ["STEM", "Coding"] to avoid partial matches
        const clubTags = clubTagsString ? clubTagsString.split(',') : [];

        // 4. If this club has the tag we just clicked...
        if (clubTags.includes(tag)) {
            // Set the checkbox to match the button 
            // (If button is ON, check it. If button is OFF, uncheck it.)
            chk.checked = isSelected;
        }
    });
}

async function saveOnboarding() {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;

    // COLLECT ALL CHECKED BOXES CLUBS
    const selectedClubs = [];
    document.querySelectorAll('#club-selection-list input:checked').forEach(chk => {
        selectedClubs.push(chk.value);
    });

    // 2. Create User Object
    const newUser = {
        name: firebaseUser.displayName,
        email: firebaseUser.email,
        includedClubs: selectedClubs,
        isAdmin: currentUser.isAdmin || false,
        createdAt: new Date(),
        CLUBOFFICER: currentUser.CLUBOFFICER || ""
    };

    try {
        await db.collection('users').doc(firebaseUser.uid).set(newUser);

        // 4. Update local state and finish
        currentUser = newUser;
        document.getElementById('onboarding-overlay').style.display = 'none';
        renderCalendar();

    } catch (error) {
        console.error("Error saving profile:", error);
        showToast("Could not save profile.")
       
    }
}

//Simple renderclubinfo
async function renderClubDirectory() {
    const container = document.getElementById('clubs-directory');
    container.innerHTML = 'Loading...';

    try {
        // 1. Fetch Clubs (Re-using your DB connection)
        const snapshot = await db.collection('clubs').get();

        container.innerHTML = ''; // Clear loading text

        if (snapshot.empty) {
            container.innerHTML = '<p>No clubs found.</p>';
            return;
        }

        // 2. Loop and Create Cards
        snapshot.forEach(doc => {
            const data = doc.data();

            const card = document.createElement('div');
            card.className = 'club-card';

            // Format Tags
            const tagsHtml = (data.tags || []).map(tag =>
                `<span class="tag-badge">${tag}</span>`
            ).join('');

            // Safe Social Link
            const socialLink = data.Socials
                ? `<a href="${data.Socials}" target="_blank" style="display:block; margin-top:10px; color:#4A90E2;">Visit Website/Socials &rarr;</a>`
                : '';

            card.innerHTML = `
                <h3>${data.Name || "Unnamed Club"}</h3>
                <p>${data.Description || data.description || "No description provided."}</p>
                <div>${tagsHtml}</div>
                ${socialLink}
            `;

            container.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading clubs:", error);
        container.innerHTML = '<p>Error loading clubs.</p>';
    }
}
//Simple calendar render
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthDisplay = document.getElementById('monthYearDisplay');

    //clear the grid
    grid.innerHTML = '';

    // Calculate dates
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    monthDisplay.innerText = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    daysOfWeek.forEach(day => {
        const div = document.createElement('div');
        div.className = 'day-name';
        div.innerText = day;
        grid.appendChild(div);
    });

    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        div.className = 'day-cell other-month';
        grid.appendChild(div);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';

        //TODAY!
        const today = new Date();
        if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
            cell.classList.add('today');
        }

        const numberSpan = document.createElement('span');
        numberSpan.className = 'day-number';
        numberSpan.innerText = day;
        cell.appendChild(numberSpan);

        // --- INSERT EVENTS HERE ---
        const eventsForDay = getEventsForDate(year, month, day);

        eventsForDay.forEach(event => {
            const chip = document.createElement('div');
            chip.onclick = () => {
                showEventPopup(event);
            };
            const myColor = clubColorMap[event.club_name] || '#4A90E2';
            chip.className = 'event-chip';
            const startTime = event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endTime = event.end ? ` - ${event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
            chip.innerText = event.title;
            chip.title = `${event.title} (${event.location})`;
            chip.style.border = `1px solid ${myColor}`; // todo this please ASDLKHJBAIOSHDIGOASDJIGOASDF;
            cell.appendChild(chip);
        });

        grid.appendChild(cell);
    }
}

function changeMonth(step) {
    currentDate.setMonth(currentDate.getMonth() + step);
    renderCalendar();
}

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderCalendar();
}


async function fetchClubsFromFirebase() {
    console.log("Connecting to Firestore...");
    const tempAllClubs = [];

    try {
        const clubsSnapshot = await db.collection("clubs").get();
        const fetchPromises = clubsSnapshot.docs.map(async (clubDoc) => {
            const clubData = clubDoc.data();

            //events
            const eventsSnapshot = await clubDoc.ref.collection("events").get();
            const cleanEvents = eventsSnapshot.docs.map(eventDoc => {
                const eventData = eventDoc.data();
                let jsDate = new Date();

                if (eventData.date) {
                    // Check if it is a Firestore Timestamp (This is what you set up!)
                    if (typeof eventData.date.toDate === 'function') {
                        jsDate = eventData.date.toDate();
                    }
                    // Fallback for strings (Just in case you have old data)
                    else {
                        jsDate = new Date(eventData.date);
                    }
                }

                let jsEnd = new Date();
                if (eventData.end) {
                    if (typeof eventData.end.toDate === 'function') {
                        jsEnd = eventData.end.toDate();
                    }
                }

                return {
                    title: eventData.title,
                    location: eventData.location,
                    description: eventData.description,
                    club_name: clubData.Name,
                    date: jsDate,
                    end: jsEnd,
                };
            });

            return {
                name: clubData.Name,
                description: clubData.Description,
                tags: clubData.tags || [],
                events: cleanEvents
            };
        });


        const results = await Promise.all(fetchPromises);
        return results;

    } catch (error) {
        console.error("Error fetching data:", error);
        showToast("Check console - Firebase Error.")
       
        return [];
    }
}

/**
 * TODO: FILL THIS IN
 * Filters events based on User Object 'includedClubs' array
 */
function getEventsForDate(year, month, day) {
    let dailyEvents = [];

    // Check if we have data
    const sourceData = window.allRealtimeEvents || [];

    sourceData.forEach(event => {
        // 1. DATE CHECK
        if (!event.date) return;
        if (event.date.getFullYear() === year &&
            event.date.getMonth() === month &&
            event.date.getDate() === day) {

            // 2. FILTER LOGIC (My Feed vs Explore)
            if (currentView === 'my_feed') {
                if (!currentUser || !currentUser.includedClubs) return;

                // Check if user subscribes to this club
                if (!currentUser.includedClubs.includes(event.club_name)) return;
            }
            dailyEvents.push(event);
        }
        // if (!event.end) return;
        // if (event.end.getFullYear() === year && 
        //     event.end.getMonth() === month && 
        //     event.end.getDate() === day) {

        //     // 2. FILTER LOGIC (My Feed vs Explore)
        //     if (currentView === 'my_feed') {
        //         if (!currentUser || !currentUser.includedClubs) return;

        //         // Check if user subscribes to this club
        //         if (!currentUser.includedClubs.includes(event.club_name)) return;
        //     }
        //     dailyEvents.push(event);
        // }

    });

    return dailyEvents;
}

// Event Popup Functions
async function showEventPopup(event) {
    document.getElementById('popupTitle').innerText = event.title;
    document.getElementById('popupClub').innerText = event.club_name;
    document.getElementById('popupDescription').innerText = event.description;
    document.getElementById('popupLocation').innerText = event.location;
    document.getElementById('popupDate').innerText = event.date.toLocaleDateString();
    document.getElementById('popupStartTime').innerText = event.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('popupEndTime').innerText = event.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let attendees = [];
    if (event.firestore_path) {
        try {
            const doc = await db.doc(event.firestore_path).get();
            if (doc.exists) {
                attendees = doc.data().attendees || [];
            }
        } catch(e) { console.log("Error fetching live count", e); }
    }

    // 2. Setup the HTML for the RSVP section
    const rsvpContainer = document.getElementById('rsvp-section');
    
    // Check if user is already in the list
    // ... inside showEventPopup ...

    // Check if user is already in the list
    const isGoing = currentUser && attendees.includes(currentUser.uid);
    const activeClass = isGoing ? "active-rsvp" : "";

    // --- NEW LOGIC: Use Viking Image instead of Emoji ---
    // If going: Normal Image. If not going: Faded Image.
    const vikingImg = isGoing 
        ? `<img src="spirit.png" class="viking-icon">` 
        : `<img src="spirit.png" class="viking-icon faded">`;
        
    const buttonText = isGoing ? "Going!" : "Interested";

    // --- UPDATED HTML STRUCTURE ---
    rsvpContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
            
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="rsvp-btn" class="rsvp-btn ${activeClass}">
                    ${vikingImg} <span>${buttonText}</span>
                </button>
                <span style="font-weight: bold; color: #555; font-size: 0.9rem;">
                    <span id="rsvp-count" style="color: var(--primary);">${attendees.length}</span> going
                </span>
            </div>

            <button id="share-btn" class="share-btn">
                Share
            </button>
        </div>
    `;
    
// ... rest of function ...

    // 3. Add Click Listener
    document.getElementById('rsvp-btn').onclick = () => toggleRSVP(event);
    document.getElementById('share-btn').onclick = () => shareEvent(event);

    document.getElementById('eventPopup').style.display = 'flex';
    if (!(currentUser && currentUser.isAdmin === true && currentUser.isAdmin === true && document.getElementById("popupClub").innerHTML === currentUser.CLUBOFFICER)) {
        document.getElementById('deleteEventBtn').style.display = 'none';
    }
    document.getElementById('deleteEventBtn').onclick = () => deleteEvent(event);
    document.getElementById('addToCalendarBtn').onclick = () => addToGoogleCalendar(event);
    document.getElementById('addToCalendarBtn').innerText = "+ Add to Google Calendar";
    let newJoinBtn = document.getElementById('addToCalendarBtn').cloneNode(true);
    document.getElementById('addToCalendarBtn').parentNode.replaceChild(newJoinBtn, document.getElementById('addToCalendarBtn'));

    // Attach the NEW Calendar function
    newJoinBtn.onclick = () => addToGoogleCalendar(event);
}


function hideEventPopup() {
    document.getElementById('eventPopup').style.display = 'none';
}
function hideEventOverlay() {
    document.getElementById('addEventOverlay').style.display = 'none';
}

// admin open add form
function openAddEventForm() {
    document.getElementById('addEventOverlay').style.display = 'flex';
    if (currentUser && currentUser.isAdmin) {
        document.getElementById('deleteEventBtn').style.display = 'flex';
    }
    else {
        document.getElementById('deleteEventBtn').style.display = 'none';
    }
}

// Listen for the Form Submit
if (document.getElementById('addEventForm')) {
    document.getElementById('addEventForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser || currentUser.isAdmin !== true) {
            showToast("Permission Denied: You are not an admin.")
           
            return;
        }

        // 1. Get values from HTML
        const title = document.getElementById('eventTitle').value;
        const clubName = document.getElementById('eventClub').value;
        const desc = document.getElementById('eventDescription').value;
        const loc = document.getElementById('eventLocation').value;

        // Get Date and Time strings separately
        const eventDate = document.getElementById('eventDate').value;      // "2025-12-25"
        const startVal = document.getElementById('eventStartTime').value; // "14:30"
        const endVal = document.getElementById('eventEndTime').value;     // "16:30"

        // 2. COMBINE Date + Time into Objects
        // Result: "2025-12-25T14:30:00"
        const startObj = new Date(`${eventDate}T${startVal}`);
        const endObj = new Date(`${eventDate}T${endVal}`);
        if (endObj <= startObj) {
            showToast("End time must be after start time!")
           
            return;
        }

        try {

            const clubQuery = await db.collection('clubs').where('Name', '==', clubName).get();

            if (clubQuery.empty) {
                alert("Error: Club not found! Please check the spelling.");
                return;
            }

            const clubDoc = clubQuery.docs[0];
            const clubId = clubDoc.id;

            // 4. ADD TO FIREBASE: Add to the 'events' sub-collection
            await db.collection('clubs').doc(clubId).collection('events').add({
                title: title,
                description: desc,
                location: loc,
                date: firebase.firestore.Timestamp.fromDate(startObj),
                end: firebase.firestore.Timestamp.fromDate(endObj),
                club_name: clubName, // SAVE THIS! Crucial for the auto-updater below
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 5. Success UI
  
            showToast("Event Added!")
            hideEventOverlay();
            document.getElementById('addEventForm').reset();

        } catch (error) {
            console.error("Error adding event: ", error);
            showToast("Something went wrong. Check console!")
           
        }
    });
}



function setupRealtimeListener() {

    console.log("Listening for real-time updates...");

    // LISTEN to all collections named 'events' across the whole database
    unsubscribeListener = db.collectionGroup('events')
        .onSnapshot((snapshot) => {

            // This code runs EVERY time data changes in Firebase
            let tempEvents = [];

            snapshot.forEach(doc => {
                const data = doc.data();

                // Convert Timestamp
                let jsDate = new Date();
                if (data.date && typeof data.date.toDate === 'function') {
                    jsDate = data.date.toDate();
                }
                let jsEnd = new Date();
                if (data.end && typeof data.end.toDate === 'function') {
                    jsEnd = data.end.toDate();
                }

                // Push to temporary array
                tempEvents.push({
                    id: doc.id,
                    title: data.title,
                    location: data.location,
                    description: data.description,
                    club_name: data.club_name, // We saved this in Part 1
                    date: jsDate,
                    end: jsEnd,
                    firestore_path: doc.ref.path
                });
            });

            // 1. Update the Global Variable
            // We need to format this to match your 'allClubsData' structure
            // Since this list is flat (just events), we restructure it slightly differently
            // or just adapt 'getEventsForDate' to read this flat list.

            // HACKATHON SHORTCUT: 
            // Save this flat list to a new global variable
            window.allRealtimeEvents = tempEvents;

            // 2. Re-Render the Calendar immediately
            renderCalendar();

            console.log("Calendar auto-updated!");
        }, (error) => {
            console.error("Real-time error:", error);
            // If this fails (due to missing index), fallback to old fetch
            // fetchClubsFromFirebase().then(renderCalendar); 
        });
}


function openProfileEditor() {
    if (!currentUser) return;

    // 1. Change the Text to look like a Settings menu
    const box = document.querySelector('.onboarding-box h2');
    const btn = document.getElementById('finish-onboarding-btn');

    if (box) box.innerText = "Update Your Interests";
    if (btn) btn.innerText = "Save Changes";

    // 2. Render the list (Re-using your existing function)
    renderOnboardingTools();

    // 3. PRE-CHECK the boxes matching the user's current clubs
    const checkboxes = document.querySelectorAll('#club-selection-list input');

    checkboxes.forEach(chk => {
        // If the club is in the user's list, check the box
        if (currentUser.includedClubs.includes(chk.value)) {
            chk.checked = true;
        }
    });

    // 4. Show the overlay
    document.getElementById('onboarding-overlay').style.display = 'flex';
}

function setupClubColorListener() {
    console.log("Loading club colors...");

    db.collection('clubs').onSnapshot(snapshot => {
        snapshot.forEach(doc => {
            const data = doc.data();
            // Map the Name to the Color
            if (data.Name && data.Color) {
                clubColorMap[data.Name] = data.Color;
            }
        });

        console.log("Updated Color Map:", clubColorMap);
        // Re-render calendar to apply new colors immediately
        renderCalendar();
    });
}

async function addToGoogleCalendar(event) {
    // 1. Check for Login & Token
    if (!googleAccessToken) {
        showToast("Please sign in with Google first!")
      
        return;
    }

    const startTime = event.date;
    const endTime = event.end;
    //const endTime = new Date(startTime.getTime() + (60 * 60 * 1000)); // Add 1 Hour

    const eventDetails = {
        summary: `Unify: ${event.title}`,
        location: event.location,
        description: `Host: ${event.club_name}\n\n${event.description}`,
        start: {
            dateTime: startTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Use user's local timezone
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };

    try {
        // 3. Send to Google Calendar API
        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(eventDetails)
        });
        if (response.status === 401) {
            // 401 means "Unauthorized" (Token Expired)
            
            alert("Your session expired. Please Sign In again to connect Google Calendar.");
            return;
        }

        if (response.ok) {
            const data = await response.json();
            showToast("Success! Event added to your Google Calendar.")
            
            console.log("Calendar Event Link:", data.htmlLink);

            // Optional: Open the calendar in a new tab so they can see it
            window.open(data.htmlLink, '_blank');
        } else {
            const errorText = await response.text();
            console.error("Google API Error:", errorText);

            showToast("Failed to add to calendar. See console.")
            
        }

    } catch (error) {
        console.error("Network Error:", error);
        alert("Network error occurred.");
    }
}

// async function fixMyDatabase() {
//     console.log("Starting database fix...");

//     // 1. Get every single event from every club
//     const snapshot = await db.collectionGroup('events').get();

//     if (snapshot.empty) {
//         console.log("No events found!");
//         return;
//     }

//     console.log(`Found ${snapshot.size} events. Updating...`);

//     // 2. Loop through them and add the path
//     const updates = snapshot.docs.map(doc => {
//         // We use .update() so we don't overwrite existing data
//         return doc.ref.update({
//             firestore_path: doc.ref.path
//         });
//     });

//     // 3. Wait for all to finish
//     await Promise.all(updates);

//     console.log("SUCCESS! All events now have a 'firestore_path' field.");
//     console.log("You can now refresh the page and the Delete button will work.");
// }

// // Run it immediately
// fixMyDatabase();

async function deleteEvent(event) {
    // 1. Confirm with the user
    if (!confirm(`Are you sure you want to delete "${event.title}"?`)) {
        return;
    }

    try {
        // 2. Delete using the path we saved in Step 1
        // event.firestore_path looks like "clubs/clubID/events/eventID"
        await db.doc(event.firestore_path).delete();

        // 3. UI Cleanup
        showToast("Event deleted");
       
        hideEventPopup();

        // Note: No need to reload! 
        // Your setupRealtimeListener will notice the deletion 
        // and remove it from the calendar automatically.

    } catch (error) {
        console.error("Error deleting event:", error);
        showToast("Could not delete event. Check console.")
     
    }
}

let isChatOpen = false;

function toggleChat() {
    const win = document.getElementById('chat-window');
    isChatOpen = !isChatOpen;
    win.style.display = isChatOpen ? 'flex' : 'none';
}

function handleChatEnter(e) {
    if (e.key === 'Enter') sendChatMessage();
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;


    addMessage(text, 'user-message');
    input.value = '';
    const clubDescriptions = allClubsData.map(c => `${c.name}: ${c.description} (Tags: ${c.tags.join(',')})`).join('\n');
    const userLikes = currentUser ? currentUser.includedClubs.join(', ') : "None";

    // 3. Construct the Prompt
    const prompt = `
    You are a helpful school club advisor.
    
    Here is the list of ALL clubs at the school:
    ${clubDescriptions}

    The current user already follows these clubs: [${userLikes}].
    
    The user just said: "${text}"

    Task:
    1. Answer the user's question or comment briefly.
    2. Based on their current interests and what they just said, recommend exactly 2 NEW clubs they might like.
    3. CRITICAL: End your response with a specific format: "Recommend [Club Name 1, Club Name 2]" so my code can parse it.
    `;

    // 4. Show Loading Bubble
    const loadingId = addMessage("Thinking...", "bot-message");

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", 
                messages: [{ role: "user", content: prompt }]
            })
        });

        const data = await response.json();
        const aiText = data.choices[0].message.content;


        document.getElementById(loadingId).remove();
        processAIResponse(aiText);

    } catch (error) {
        console.error("AI Error:", error);
        document.getElementById(loadingId).innerText = "Sorry, I'm having trouble thinking right now.";
    }
}

function addMessage(text, className) {
    const div = document.createElement('div');
    div.className = `message ${className}`;
    div.innerText = text;
    div.id = 'msg-' + Date.now();
    document.getElementById('chat-messages').appendChild(div);
    
    // Auto scroll to bottom
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
    
    return div.id;
}

function processAIResponse(text) {
    // 1. Extract the Recommendation part using Regex
    // Looks for "Recommend [Name, Name]"
    const recRegex = /Recommend \[(.*?)\]/;
    const match = text.match(recRegex);

    let cleanText = text;
    let recommendedClubs = [];

    if (match) {
        // Remove the technical command from the visible text
        cleanText = text.replace(match[0], "");
        
        // Parse the club names
        recommendedClubs = match[1].split(',').map(s => s.trim());
    }

    // 2. Show the text part
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message bot-message';
    msgDiv.innerText = cleanText;
    document.getElementById('chat-messages').appendChild(msgDiv);

    // 3. Render the Selection Boxes (if recommendations exist)
    if (recommendedClubs.length > 0) {
        renderRecommendationBox(recommendedClubs);
    }
    
    // Auto scroll
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function renderRecommendationBox(clubNames) {
    const container = document.getElementById('chat-messages');
    
    const box = document.createElement('div');
    box.className = 'message bot-message recommendation-box';
    
    const title = document.createElement('div');
    title.innerHTML = "<strong>Quick Add:</strong>";
    box.appendChild(title);

    clubNames.forEach(name => {
       
        const row = document.createElement('div');
        row.className = 'rec-item';
        
        row.innerHTML = `
            <input type="checkbox" id="rec-${name}" value="${name}">
            <label for="rec-${name}">${name}</label>
        `;
        box.appendChild(row);
    });

    const btn = document.createElement('button');
    btn.className = 'rec-add-btn';
    btn.innerText = "Add Selected Clubs";
    btn.onclick = () => addRecommendedClubsToProfile(box);
    box.appendChild(btn);

    container.appendChild(box);
}

async function addRecommendedClubsToProfile(boxElement) {
    if (!currentUser) {
        
        showToast("Please login!");
        return;
    }

    const checkboxes = boxElement.querySelectorAll('input:checked');
    if (checkboxes.length === 0) return;

    const newClubs = [];
    checkboxes.forEach(chk => {
        // Only add if not already in list
        if (!currentUser.includedClubs.includes(chk.value)) {
            currentUser.includedClubs.push(chk.value);
            newClubs.push(chk.value);
        }
    });

    if (newClubs.length === 0) {
        alert("You already follow these clubs!");
        return;
    }

    // Save to Firebase
    try {
        await db.collection('users').doc(currentUser.uid).update({
            includedClubs: currentUser.includedClubs
        });
        
        // Update UI
        boxElement.innerHTML = `<em>Added: ${newClubs.join(', ')}!</em>`;
        renderCalendar(); // Refresh main view
        
    } catch (e) {
        console.error(e);
        showToast("Error saving clubs.")
       
    }
}

function showToast(message) {
    const x = document.getElementById("toast");
    x.innerText = message;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

async function toggleRSVP(event) {
    if (!currentUser) {
        alert("Please login to RSVP!");
        return;
    }

    const rsvpBtn = document.getElementById('rsvp-btn');
    const rsvpCount = document.getElementById('rsvp-count');
    
    // Save original in case of error
    const originalHTML = rsvpBtn.innerHTML;
    
    // Temporary Loading State
    rsvpBtn.innerHTML = "...";
    
    try {
        if (!event.firestore_path) {
            alert("Error: Cannot find event path.");
            return;
        }

        const eventRef = db.doc(event.firestore_path);
        
        // Check current status
        const doc = await eventRef.get();
        if (!doc.exists) return;
        
        const data = doc.data();
        const attendees = data.attendees || [];
        const isAlreadyGoing = attendees.includes(currentUser.uid);

        if (isAlreadyGoing) {
            // REMOVE USER (Turn Viking Gray)
            await eventRef.update({
                attendees: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
            });
            
            // Set to "Interested" state with Faded Viking
            rsvpBtn.innerHTML = `<img src="spirit.png" class="viking-icon faded"> <span>Interested</span>`;
            rsvpBtn.classList.remove('active-rsvp');
            
            if(rsvpCount) rsvpCount.innerText = Math.max(0, attendees.length - 1);
            
        } else {
            // ADD USER (Turn Viking Color)
            await eventRef.update({
                attendees: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
            });
            
            // Set to "Going" state with Full Color Viking
            rsvpBtn.innerHTML = `<img src="spirit.png" class="viking-icon "> <span>Going!</span>`;
            rsvpBtn.classList.add('active-rsvp');
            
            if(rsvpCount) rsvpCount.innerText = attendees.length + 1;
        }

    } catch (error) {
        console.error("RSVP Error:", error);
        alert("Failed to update RSVP.");
        rsvpBtn.innerHTML = originalHTML; // Revert UI
    }
}

async function shareEvent(event) {
    // 1. Construct the specific message you asked for
    const shareTitle = `Join ${event.club_name} Meeting`;
    const shareText = `Join the ${event.club_name} meeting: ${event.title}`;
    const shareUrl = window.location.href; // The current link to your app

    // 2. Try Native Share (Phones/Safari)
    if (navigator.share) {
        navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl 
        }).catch((error) => console.log('Sharing failed', error));
    } 
    // 3. Fallback to Clipboard (Desktop Chrome/Firefox)
    // We combine TEXT + URL here so the user gets both when they paste
    else {
        
        const clipboardText = `${shareText}\n${shareUrl}`;
        await navigator.clipboard.writeText(clipboardText);
        alert("Event link and details copied to clipboard!"); 
    }
}
