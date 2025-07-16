let isProcessing = false;

// Handle Enter key press
document.getElementById('question').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
        e.preventDefault();
        submitQuery();  // Call without method param
    }
});

// Auto-focus input on load
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('question').focus();
});

async function submitQuery() {
    const question = document.getElementById('question').value.trim();
    const method = document.getElementById('searchMethod').value;
    const messagesContainer = document.getElementById('messages');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const sendBtn = document.getElementById('sendBtn');
    const questionInput = document.getElementById('question');

    if (!question) {
        showError('Please enter a question before searching.');
        return;
    }

    if (isProcessing) return;

    isProcessing = true;

    // Disable inputs
    sendBtn.disabled = true;
    questionInput.disabled = true;
    loadingOverlay.style.display = 'flex';

    // Add user message
    addMessage('user', question);

    // Clear input
    questionInput.value = '';

    try {
        const response = await fetch('/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                question: question,
                method: method
            })
        });

        const data = await response.json();

        if (response.ok && data.response) {
            addMessage('assistant', data.response, data.method);
        } else {
            const errorMsg = data.error || 'An unexpected error occurred.';
            addMessage('assistant', '', null, errorMsg);
        }
    } catch (error) {
        console.error('Error:', error);
        addMessage('assistant', '', null, 'Unable to connect to the server. Please check your connection and try again.');
    } finally {
        sendBtn.disabled = false;
        questionInput.disabled = false;
        loadingOverlay.style.display = 'none';
        questionInput.focus();
        isProcessing = false;
    }
}

function addMessage(sender, content, method = null, error = null) {
    const messagesContainer = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = sender === 'user'
        ? '<i class="fas fa-user"></i>'
        : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';

    if (error) {
        contentDiv.innerHTML = `<div class="error-message">${error}</div>`;
    } else {
        let html = '';

        if (method && method !== 'openai') {
            const methodClass = method === 'global' ? 'global' : 'local';
            const methodIcon = method === 'global' ? 'fas fa-globe' : 'fas fa-search';
            html += `<div class="method-badge ${methodClass}"><i class="${methodIcon}"></i> ${method.charAt(0).toUpperCase() + method.slice(1)} Search</div>`;
        }

        html += `<p>${formatResponse(content)}</p>`;
        contentDiv.innerHTML = html;
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function formatResponse(text) {
    if (!text) return '';
    text = text.replace(/\n/g, '<br>');
    text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return text;
}

function showError(message) {
    const messagesContainer = document.getElementById('messages');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'message assistant';
    errorDiv.innerHTML = `
        <div class="avatar"><i class="fas fa-robot"></i></div>
        <div class="content">
            <div class="error-message">${message}</div>
        </div>
    `;
    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    setTimeout(() => {
        if (errorDiv.parentNode) errorDiv.remove();
    }, 5000);
}

// Visual feedback for button press
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('search-btn')) {
        e.target.style.transform = 'scale(0.95)';
        setTimeout(() => {
            e.target.style.transform = '';
        }, 150);
    }
});

// Maintain scroll after resize
window.addEventListener('resize', function() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});
