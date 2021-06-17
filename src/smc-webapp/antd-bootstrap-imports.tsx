/* This is entirely to workaround a weird bug
  in webpack (or typescript) bug and also
  avoid importing all of antd (just what we need).
*/

export { Button, Card, Checkbox, Row, Col, Tabs, Modal, Alert } from "antd";
