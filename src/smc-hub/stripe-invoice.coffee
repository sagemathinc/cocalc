path       = require('path')
fs         = require('fs')
async      = require('async')

misc       = require('smc-util/misc')

misc_node  = require('smc-util-node/misc_node')

WEBAPP_LIB = misc_node.WEBAPP_LIB

# Render a stripe invoice/receipt using pdfkit = http://pdfkit.org/
exports.stripe_render_invoice = (stripe, invoice_id, download, res) ->
    if not stripe?
        # stripe not available, configured or initaialized yet
        res.status(404).send("stripe not available")
        return
    invoice  = undefined
    customer = undefined
    charge   = undefined
    async.series([
        (cb) ->
            stripe.invoices.retrieve invoice_id, (err, x) ->
                invoice = x; cb(err)
        (cb) ->
            stripe.customers.retrieve invoice.customer, (err, x) ->
                customer = x; cb(err)
        (cb) ->
            if not invoice.paid
                # no time paid
                cb()
            else if not invoice.charge
                # there was no charge (e.g., a trial)
                cb()
            else
                stripe.charges.retrieve invoice.charge, (err, x) ->
                    charge = x; cb(err)
        (cb) ->
            render_invoice_to_pdf(invoice, customer, charge, res, download, cb)
    ], (err) ->
        if err
            res.status(404).send(err)
    )

render_invoice_to_pdf = (invoice, customer, charge, res, download, cb) ->
    PDFDocument = require('pdfkit')
    doc = new PDFDocument

    # Use a unicode friendly font: see http://stackoverflow.com/questions/18718559/how-to-output-euro-symbol-in-pdfkit-for-nodejs
    # This should just be in our git repo, so should work.
    font = "#{__dirname}/fonts/Cardo-Regular.ttf"
    if fs.existsSync(font)
        doc.registerFont('Cardo', font)
        doc.font('Cardo')

    if download
        res.setHeader('Content-disposition', 'attachment')

    doc.pipe(res)

    doc.image(path.join(process.env.SMC_ROOT, "#{WEBAPP_LIB}/favicon-128.png"), 268, 15, {width: 64, align: 'center'})
    y = 100
    c1 = 100
    if invoice.paid
        doc.fontSize(35).text('SageMath, Inc. - Receipt', c1, y)
    else
        doc.fontSize(35).text('SageMath, Inc. - Invoice', c1, y)

    y += 60
    c2 = 260
    doc.fontSize(14)
    doc.fillColor('#555')
    doc.text("Date", c1, y)
    doc.text("ID")
    doc.text("Name")
    doc.text("Email")
    if invoice.paid
        doc.text("Card charged")

    doc.fillColor('black')
    doc.text(misc.stripe_date(invoice.date), c2, y)
    #doc.text(invoice.id.slice(invoice.id.length-6).toLowerCase())
    doc.text("#{invoice.date}")
    doc.text(customer.description)
    doc.text(customer.email)
    if invoice.paid and charge?.source?
        doc.text("#{charge.source.brand} ending #{charge.source.last4}")

    y += 120
    doc.fontSize(24).text("Items", c1, y)

    y += 40
    doc.fontSize(12)
    v = []
    for x in invoice.lines.data
        if x.description
            desc = misc.trunc(x.description, 60)
        else if x.plan?
            desc = x.plan.name
        else
            desc = "SageMathCloud services"
        v.push
            desc   : desc
            amount : "USD $#{x.amount/100}"
    if invoice.tax
        v.push
            desc : "Sales Tax"
            amount : "USD $#{invoice.tax/100}"

    for i in [0...v.length]
        if i == 0
            doc.text("#{i+1}. #{v[i].desc}", c1, y)
        else
            doc.text("#{i+1}. #{v[i].desc}")
    doc.moveDown()
    if invoice.paid
        doc.text("PAID")
    else
        doc.text("DUE")

    for i in [0...v.length]
        if i == 0
            doc.text(v[i].amount, c2+100+90, y)
        else
            doc.text(v[i].amount)
    doc.moveDown()
    doc.text("USD $#{invoice.total/100}")

    y += 300
    doc.fontSize(14)
    doc.text("Contact us with any questions by emailing billing@sagemath.com.", c1, y)
    if not invoice.paid
        doc.moveDown()
        doc.text("To pay, sign into your account at https://cloud.sagemath.com and add a payment method in the billing tab under account settings.")
    else
        doc.text("Thank you for using https://cloud.sagemath.com.")

    doc.end()
    cb()
