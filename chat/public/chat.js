let currentChannelID;

async function fetchChannels() { 
    const response = await fetch('/Channel')
    const Channels = await response.json();
    const channelSelect = document.getElementById('channel-select');

    channelSelect.innerHTML = ''; // Tøm tidligere kanaler
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

async function fetchMessages(currentChannelID) {
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
        UsernameContent.style.color = 'lightblue';
        UsernameContent.style.fontFamily = 'Roboto, monospace';

        messageDiv.append(profilePic, UsernameContent);

        if (msg.Content) {
            const messageContent = document.createElement('span');
            messageContent.textContent = ` ${msg.Content}`;
            messageContent.style.color = 'white';
            messageDiv.append(messageContent);
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
            messageDiv.append(messageImage);
        }

        messageDiv.style.marginBottom = '15px';
        messageDiv.style.borderBottom = '4px solid gray';
        messageDiv.style.paddingBottom = '10px';

        messagesContainer.append(messageDiv);
        
    });
}

document.getElementById('channel-select').addEventListener('change', (e) => {
    currentChannelID = e.target.value;
    fetchMessages(currentChannelID);
});

document.getElementById('send-button').addEventListener('click', async (event) => {
  event.preventDefault();

  const messageInput = document.getElementById('message-input');
  const imageInput = document.getElementById('image-input'); // forventes <input type="file" id="image-input">
  const Content = messageInput.value.trim();
  const imageFile = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
    let now = new Date();
    let Time = now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, '0') + "-" +
    String(now.getDate()).padStart(2, '0') + " " +
    String(now.getHours()).padStart(2, '0') + ":" +
    String(now.getMinutes()).padStart(2, '0') + ":" +
    String(now.getSeconds()).padStart(2, '0');

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
  fetchMessages(currentChannelID);
});

fetchChannels();

setInterval(() => {
    fetchMessages(currentChannelID);
}, 5000);
