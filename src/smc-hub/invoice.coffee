misc = require('smc-util/misc')
misc_node = require('smc-util-node/misc_node')
WEBAPP_LIB = misc_node.WEBAPP_LIB

render_invoice_to_pdf = (invoice, customer, charge) ->
    PDFDocument = require('pdfkit')
    doc = new PDFDocument

    doc.pipe(require('fs').createWriteStream('receipt.pdf'))

    doc.image("#{WEBAPP_LIB}/favicon-128.png", 268, 15, {width: 64, align: 'center'})
    y = 100
    c1 = 100
    if invoice.paid
        doc.fontSize(35).text('SageMath, Inc. - Receipt', c1, y)
    else
        doc.fontSize(35).text('SageMath, Inc. - Invoice', c1, y)

    y += 60
    c2 = 360
    doc.fontSize(16)
    doc.fillColor('#555')
    doc.text("Date", c1, y)
    doc.text("ID")
    doc.text("Account")
    doc.text("Email")
    if invoice.paid
        doc.text("Card charged")

    doc.fillColor('black')
    doc.text(misc.stripe_date(invoice.date), c2, y)
    doc.text(invoice.id.slice(invoice.id.length-6).toLowerCase())
    doc.text(customer.description)
    doc.text(customer.email)
    if invoice.paid
        doc.text("#{charge.source.brand} ending #{charge.source.last4}")

    y += 120
    doc.fontSize(24).text("Items", c1, y)

    y += 40
    doc.fontSize(12)
    v = []
    for x in invoice.lines.data
        v.push
            desc   : misc.trunc(x.description,60)
            amount : "USD $#{x.amount/100}"

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
            doc.text(v[i].amount, c2+90, y)
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

exports.go = () ->
    charge =
        source :
            brand : 'Visa'
            last4 : 'xxxx'
    customer =
        email       : 'address@stuff'
        description : 'John Smith'
    invoice =
        date : 1431729520
        paid : true
        id   : 'in_162...'
        lines :
            data : [{description:'...', amount:1000}, {description:"WA state sales tax", amount:902}]
        total : 1902

    render_invoice_to_pdf(invoice, customer, charge)

