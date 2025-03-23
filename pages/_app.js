import { useEffect } from "react";
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return <Component {...pageProps} />;
}
