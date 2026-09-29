declare namespace React {
  type ReactNode = any;
  interface ComponentClass<P = any> { new(props: P): Component<P, any>; }
  class Component<P = any, S = any> {
    constructor(props: P);
    props: Readonly<P>;
    state: Readonly<S>;
    setState(state: Partial<S> | ((prev: S, props: P) => Partial<S>), callback?: () => void): void;
    forceUpdate(callback?: () => void): void;
  }
  function createElement(type: any, props?: any, ...children: any[]): any;
  function createRef<T = any>(): { current: T | null };
  const Fragment: any;
}
declare const React: {
  Component: typeof React.Component;
  createElement: typeof React.createElement;
  createRef: typeof React.createRef;
  Fragment: typeof React.Fragment;
};
declare const ReactDOM: {
  render(element: any, container: Element | DocumentFragment, callback?: () => void): any;
};
declare namespace JSX {
  type Element = any;
  interface ElementClass { render: any; }
  interface IntrinsicAttributes { key?: any; }
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicElements { [elemName: string]: any; }
}
interface Window {
  BarcodeDetector?: any;
  ZXingBrowser?: any;
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
  NOURISH_CONFIG?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    backendFunctionUrl?: string;
  };
}
