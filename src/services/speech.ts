export function speechRecognitionSupported(): boolean {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function listenOnce(onText: (text: string) => void, onError: (message: string) => void): { stop(): void } {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) throw new Error('Voice input is not supported in this browser.');
  const recognition = new Ctor();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event: any) => onText(event.results?.[0]?.[0]?.transcript ?? '');
  recognition.onerror = (event: any) => onError(event.error ? `Voice input: ${event.error}` : 'Voice input failed.');
  recognition.start();
  return { stop: () => recognition.stop() };
}
