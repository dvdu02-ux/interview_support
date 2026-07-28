use crate::ai::{AIMessage, AIRole, ChatRequest, OpenAICompatibleClient};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Serialize, Deserialize)]
pub struct AIConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Generate AI answer (streaming)
#[tauri::command]
pub async fn ai_generate_answer(
    config: AIConfig,
    system_prompt: String,
    user_message: String,
    channel: Channel<String>,
) -> Result<(), String> {
    let client = OpenAICompatibleClient::new(config.base_url, config.api_key);
    
    let request = ChatRequest {
        model: config.model,
        messages: vec![
            AIMessage {
                role: AIRole::System,
                content: system_prompt,
            },
            AIMessage {
                role: AIRole::User,
                content: user_message,
            },
        ],
        temperature: Some(0.7),
        max_tokens: Some(2000),
        stream: Some(true),
    };

    client
        .chat_completion_stream(request, channel)
        .await
        .map_err(|e| format!("AI service error: {}", e))
}

/// Detect if text is a question (non-streaming, returns boolean)
#[tauri::command]
pub async fn ai_detect_question(
    config: AIConfig,
    text: String,
) -> Result<bool, String> {
    let client = OpenAICompatibleClient::new(config.base_url, config.api_key);
    
    let system_prompt = "You are a question detector. Respond with ONLY 'true' or 'false'. \
                        Analyze if the given text is a question that expects an answer.";
    
    let request = ChatRequest {
        model: config.model,
        messages: vec![
            AIMessage {
                role: AIRole::System,
                content: system_prompt.to_string(),
            },
            AIMessage {
                role: AIRole::User,
                content: text,
            },
        ],
        temperature: Some(0.1),
        max_tokens: Some(10),
        stream: Some(false),
    };

    let response = client
        .chat_completion(request)
        .await
        .map_err(|e| format!("AI service error: {}", e))?;

    let answer = response
        .choices
        .first()
        .ok_or("No response from AI")?
        .message
        .content
        .trim()
        .to_lowercase();

    Ok(answer == "true")
}
