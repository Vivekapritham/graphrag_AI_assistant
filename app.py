from flask import Flask, render_template, request, jsonify
import subprocess
import os
import re
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("GRAPHRAG_API_KEY"))

def clean_graphrag_output(output):
    """Clean GraphRAG output by removing metadata, JSON blocks, and status lines"""
    lines = output.splitlines()
    clean_lines = []
    
    in_json_block = False
    brace_depth = 0

    for line in lines:
        stripped = line.strip()

        if not stripped:
            continue

        # Detect start of JSON or config-like blocks
        if not in_json_block and (
            stripped.startswith('{') or 
            stripped.startswith('[') or 
            re.match(r'^"?[a-zA-Z0-9_]+"?\s*:\s*\{', stripped)  # e.g., default_vector_store: {
        ):
            in_json_block = True
            brace_depth = stripped.count('{') + stripped.count('[') - stripped.count('}') - stripped.count(']')
            continue

        elif in_json_block:
            brace_depth += stripped.count('{') + stripped.count('[')
            brace_depth -= stripped.count('}') + stripped.count(']')

            if brace_depth <= 0:
                in_json_block = False
            continue

        # Skip metadata lines or paths
        if stripped.startswith(('SUCCESS:', 'INFO:', 'ERROR:', 'WARNING:')):
            continue
        if any(kw in stripped.lower() for kw in ['vector store', 'db_uri', 'lancedb', 'redacted']):
            continue

        # Skip stray closing brace
        if stripped == '}':
            continue

        clean_lines.append(stripped)

    result = '\n'.join(clean_lines).strip()
    return result if result else "I'm ready to help! Please ask me a question about your data."

def is_meaningful_response(response):
    """Check if the GraphRAG response contains meaningful content from the dataset"""
    # Generic responses that indicate no relevant data was found
    generic_phrases = [
        "i am here to assist you",
        "feel free to ask",
        "i will do my best",
        "how can i assist you",
        "i'm ready to help",
        "please ask me a question",
        "i'll be happy to help"
    ]
    
    response_lower = response.lower()
    
    # If response is too short or contains generic phrases, it's likely not meaningful
    if len(response) < 50 or any(phrase in response_lower for phrase in generic_phrases):
        return False
    
    return True

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/query", methods=["POST"])
def query():
    data = request.get_json()
    question = data.get("question", "").strip()
    method = data.get("method", "global")

    if not question:
        return jsonify({"error": "Please enter a question"}), 400

    cleaned_output = ""
    try:
        # 1. Try GraphRAG
        result = subprocess.run(
            [
                "graphrag",
                "query",
                "--root", PROJECT_ROOT,
                "--method", method,
                "--query", question
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=60
        )
        output = result.stdout.strip()
        cleaned_output = clean_graphrag_output(output)

        # 2. If meaningful GraphRAG result, use it
        if is_meaningful_response(cleaned_output):
            return jsonify({
                "response": cleaned_output,
                "method": method
            })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Query timed out. Please try again."}), 500
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.strip() if e.stderr else "GraphRAG command failed"
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        print("GraphRAG error fallback:", str(e))  # Logging

    # 3. Fallback to OpenAI for chit-chat or general queries
    try:
        chat_response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant who answers data questions using available tools, but you can also handle general friendly chat and fun when appropriate."},
                {"role": "user", "content": question}
            ],
            temperature=0.7
        )
        ai_reply = chat_response.choices[0].message.content.strip()
        return jsonify({
            "response": ai_reply,
            "method": "openai"
        })
    except Exception as e:
        return jsonify({"error": f"OpenAI fallback failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True)