express = require('express')
app = express()

app.get('/', (req, res) -> res.send("Hello"))

app.listen(3000)



