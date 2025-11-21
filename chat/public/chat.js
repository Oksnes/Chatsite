let currentChannelID;

async function fetchChannels() { //funksjon for å hente kanaler
    const response = await fetch('/Channel')
    const Channels = await response.json();
    const channelSelect = document.getElementById('channel-select');

    channelSelect.innerHTML = ''; // passer på at den er tom før vi legger til nye options
    Channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel.ChannelID;
        option.textContent = channel.ChannelName;
        channelSelect.appendChild(option);
    });

    if (Channels.length > 0) {
        currentChannelID = Channels[0].ChannelID;
        fetchMessages(currentChannelID);
    }
}

async function fetchMessages(currentChannelID, scroll = false) { //scroll parameter to decide whether to scroll down after fetching
    const response = await fetch(`/Channel/${currentChannelID}/Messages`);
    const messages = await response.json();
    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = ''; // Tøm tidligere meldinger

    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const profilePic = document.createElement('img');

        profilePic.src = msg.ProfilePicture;
        profilePic.alt = `${msg.Username} Profile Picture`;
        profilePic.style.width = '64px';
        profilePic.style.height = '64px';
        profilePic.style.marginRight = '10px';

        const UsernameContent = document.createElement('span');
        UsernameContent.textContent = `${msg.Username}:`;
        UsernameContent.style.fontWeight = 'bold';
        UsernameContent.style.color = 'steelblue';
        UsernameContent.style.fontFamily = 'Roboto, monospace';
        UsernameContent.style.fontSize = '1.3rem';

        messageDiv.append(profilePic, UsernameContent);

        if (msg.Content) {
            const messageContent = document.createElement('span');
            messageContent.textContent = ` ${msg.Content}`;
            messageContent.style.color = 'white';
            messageDiv.append(messageContent);
            messageDiv.style.overflowWrap = 'break-word';
        }

        const timeStamp = document.createElement('div');
        timeStamp.textContent = msg.Time;
        timeStamp.style.fontSize = '0.8em';
        timeStamp.style.color = 'gray';
        messageDiv.appendChild(timeStamp);

        if (msg.ImagePath) {
            const messageImage = document.createElement('img');
            messageImage.src = msg.ImagePath;
            messageImage.alt = 'Image sent in chat';
            messageImage.style.maxWidth = '750px';
            messageImage.style.maxHeight = '250px';
            messageImage.style.display = 'block';
            messageImage.style.marginTop = '10px';
            messageImage.style.marginLeft = '74px'; // align with text after profile pic
            messageDiv.append(messageImage);
        }

        messageDiv.style.marginBottom = '15px';
        messageDiv.style.borderBottom = '4px solid gray';
        messageDiv.style.paddingBottom = '10px';

        messagesContainer.append(messageDiv);
        
    });

     // Scroll to bottom after rendering messages, only if specified
    if (scroll) {
        const messagesContainerEl = document.getElementById('messages-container');
        if (messagesContainerEl) {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior: 'smooth' });
        }
    }
}

document.getElementById('channel-select').addEventListener('change', (e) => { //funksjon for å endre variabelen currentChannelID
    currentChannelID = e.target.value;
    fetchMessages(currentChannelID);
});

document.getElementById('send-button').addEventListener('click', async (event) => {
    event.preventDefault();

    const messageInput = document.getElementById('message-input');
    const imageInput = document.getElementById('image-input'); // forventes <input type="file" id="image-input">
    const Content = messageInput.value.trim();
    const imageFile = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;

    if (!Content && !imageFile) return; // Unngå å sende tomme meldinger

    const formData = new FormData();
    if (Content) formData.append('Content', Content);
    if (imageFile) formData.append('Image', imageFile);

    await fetch(`/Channel/${currentChannelID}/Messages`, {
        method: 'POST',
        body: formData
    });

    messageInput.value = '';
    imageInput.value = '';
    fetchMessages(currentChannelID, true); //fetch messages and scroll down
});

async function fetchUsers() {
    const response = await fetch('/getUsers');  
    const Users = await response.json();
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    userList.style.display = 'flex';
    userList.style.flexDirection = 'column';
    userList.style.gap = '6px';

    Users.forEach(User => {

    const userRow = document.createElement('div');
    userRow.style.display = 'flex';
    userRow.style.alignItems = 'center';
    userRow.style.gap = '8px';
    userRow.style.padding = '4px 0';

    const profilePic = document.createElement('img');
    profilePic.src = User.ProfilePicture;
    profilePic.alt = `${User.Username} Profile Picture`;
    profilePic.style.width = '32px';
    profilePic.style.height = '32px';
    profilePic.style.objectFit = 'cover';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `(${User.UserID}) ${User.Username}`;
    nameSpan.style.color = 'white';
    nameSpan.style.fontFamily = 'Roboto, monospace';

    userRow.append(profilePic, nameSpan);
    userList.appendChild(userRow);
    });
}


fetchChannels();

setInterval(() => {
    fetchMessages(currentChannelID); //fetch messages every 5 seconds without scrolling down
}, 5000);

fetchUsers();