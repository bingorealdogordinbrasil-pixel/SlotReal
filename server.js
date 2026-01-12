const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CONEXÃO MONGODB
const MONGO_URI = "mongodb+srv://SlotReal:A1l9a9n7@cluster0.ap7q4ev.mongodb.net/SlotGame?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ BANCO CONECTADO"))
    .catch(err => console.error("❌ ERRO BANCO:", err));

// MODELOS
const User = mongoose.model('User', new mongoose.Schema({
    user: { type: String, unique: true, required: true },
    pass: { type: String, required: true },
    fone: String,
    saldo: { type: Number, default: 1.00 }
}));

const Saque = mongoose.model('Saque', new mongoose.Schema({
    user: String, chave: String, valor: Number, status: { type: String, default: 'PENDENTE' },
    data: { type: String, default: () => new Date().toLocaleString('pt-BR') }
}));

// MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: 'APP_USR-480319563212549-011210-80973eae502f42ff3dfbc0cb456aa930-485513741' });
const payment = new Payment(client);

// ROTAS
app.post('/auth/cadastro', async (req, res) => {
    try {
        const { user, pass, fone } = req.body;
        const novo = new User({ user, pass, fone });
        await novo.save();
        res.json({ success: true, saldo: 1.00 });
    } catch (e) { res.json({ success: false, message: "Usuário já existe!" }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { user, pass } = req.body;
        const conta = await User.findOne({ user, pass });
        if (conta) res.json({ success: true, saldo: conta.saldo });
        else res.json({ success: false, message: "Dados incorretos!" });
    } catch (e) { res.status(500).send(); }
});

app.post('/api/save-saldo', async (req, res) => {
    try {
        await User.findOneAndUpdate({ user: req.body.user }, { saldo: req.body.saldo });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.post('/gerar-pix', async (req, res) => {
    try {
        const result = await payment.create({ body: {
            transaction_amount: 10.00, description: 'Depósito SlotReal',
            payment_method_id: 'pix', payer: { email: 'admin@slotreal.com' }
        }});
        res.json({
            copia_e_cola: result.point_of_interaction.transaction_data.qr_code,
            imagem_qr: result.point_of_interaction.transaction_data.qr_code_base64
        });
    } catch (e) { res.status(500).json(e); }
});

app.post('/api/solicitar-saque', async (req, res) => {
    try {
        const novo = new Saque({ user: req.body.user, chave: req.body.chave, valor: req.body.valor });
        await novo.save();
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.get('/painel-adm-secreto', async (req, res) => {
    const saques = await Saque.find().sort({ _id: -1 });
    let html = saques.map(s => `<tr><td>${s.data}</td><td>${s.user}</td><td>${s.chave}</td><td>R$ ${s.valor}</td><td>${s.status}</td></tr>`).join('');
    res.send(`<h1>Saques</h1><table border="1" style="width:100%">${html}</table>`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
