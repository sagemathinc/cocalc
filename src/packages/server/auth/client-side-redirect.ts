export default async function clientSideRedirect({ res, target }) {
  res.send(
    `<head>
  <script>
    window.onload = function () {
      window.location.href = "${target}";
      setTimeout(function() {
        const element = document.getElementById('redirect-msg');
        element.style.display = 'block';
      }, 3000);
    };
  </script>
</head>
<body>
  <div id="redirect-msg" style="display: none;">
    You should be redirected to <a href="${target}">${target}</a>.
  </div>
</body>`,
  );
}
