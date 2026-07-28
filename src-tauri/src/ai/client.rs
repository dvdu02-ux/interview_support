use super::types::{ChatRequest, ChatResponse, StreamChunk};
use futures_util::StreamExt;
use reqwest::Client;
use serde_json;
use std::error::Error;
use tauri::ipc::Channel;

/// OpenAI-compatible API client
pub struct OpenAICompatibleClient {
    base_url: String,
    api_key: String,
    client: Client,
}

impl OpenAICompatibleClient {
    /// Create new client
    pub fn new(base_url: String, api_key: String) -> Self {
        Self {
            base_url,
            api_key,
            client: Client::new(),
        }
    }

    /// Send chat completion request (non-streaming)
    pub async fn chat_completion(
        &self,
        request: ChatRequest,
    ) -> Result<ChatResponse, Box<dyn Error>> {
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, error_text).into());
        }

        let chat_response: ChatResponse = response.json().await?;
        Ok(chat_response)
    }

    /// Send chat completion request (streaming)
    pub async fn chat_completion_stream(
        &self,
        request: ChatRequest,
        channel: Channel<String>,
    ) -> Result<(), Box<dyn Error>> {
        let url = format!("{}/chat/completions", self.base_url.trim_end_matches('/'));
        
        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            channel.send(format!("[ERROR] API error {}: {}", status, error_text))?;
            return Err(format!("API error {}: {}", status, error_text).into());
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    
                    // Process complete SSE messages
                    while let Some(line_end) = buffer.find('\n') {
                        let line = buffer[..line_end].trim().to_string();
                        buffer = buffer[line_end + 1..].to_string();
                        
                        if line.is_empty() || line == "data: [DONE]" {
                            continue;
                        }
                        
                        if let Some(json_str) = line.strip_prefix("data: ") {
                            match serde_json::from_str::<StreamChunk>(json_str) {
                                Ok(chunk) => {
                                    for choice in chunk.choices {
                                        if let Some(content) = choice.delta.content {
                                            // Send content chunk to frontend
                                            if let Err(e) = channel.send(content) {
                                                eprintln!("[AI Stream] Channel send error: {}", e);
                                                return Err(e.into());
                                            }
                                        }
                                        
                                        // Check if stream finished
                                        if choice.finish_reason.is_some() {
                                            return Ok(());
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[AI Stream] JSON parse error: {} | line: {}", e, json_str);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    channel.send(format!("[ERROR] Stream error: {}", e))?;
                    return Err(e.into());
                }
            }
        }

        Ok(())
    }
}
