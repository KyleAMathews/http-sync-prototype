import { createServer } from "./server"
import { schema } from "./test-electric-instance/src/generated/client"

const config = {
  url: `http://localhost:5233`,
}

createServer({ config, schema })
