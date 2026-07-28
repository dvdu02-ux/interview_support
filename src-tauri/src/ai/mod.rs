/// AI Service Layer — abstraction for OpenAI-compatible API providers
pub mod client;
pub mod types;

pub use client::OpenAICompatibleClient;
pub use types::{AIMessage, AIRole, ChatRequest};
