import { Redirect } from "expo-router";

// The assistant's place in the tab bar. The tab is disabled, so a tap opens Capture and never lands here; a link that
// reaches this route anyway goes back to Today.
export default function AssistantTab() {
  return <Redirect href="/" />;
}
