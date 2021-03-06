const BigNumber = require('bignumber.js')
const {LibraClient, LibraNetwork, Account, LibraWallet, LibraAdmissionControlStatus } = require('libra-core')
const axios = require('axios')
const moment = require('moment')

class Libra {
  constructor () {

  }

  async queryBalance(address) {
    const client = new LibraClient({ network: LibraNetwork.Testnet })
  
    const accountState = await client.getAccountState(address)
  
    // balance in micro libras
    const balanceInMicroLibras = BigNumber(accountState.balance.toString(10))

    const balace = balanceInMicroLibras.dividedBy(BigNumber(1e6))

    return balace.toString(10)
  }

  async createWallet() {
    const client = new LibraClient({ network: LibraNetwork.Testnet })

    // Generate account
    const wallet = new LibraWallet()
    const account = wallet.newAccount()

    return {
      address: account.getAddress().toHex(),
      mnemonic: wallet.config.mnemonic
    }
  }

  async transfer(mnemonic, toAddress, amount) {
    const client = new LibraClient({ network: LibraNetwork.Testnet })
    const wallet = new LibraWallet({
      mnemonic: mnemonic
    })
    const account = wallet.generateAccount(0)
    const amountToTransfer = BigNumber(amount).times(1e6)

    // Stamp account state before transfering
    const beforeAccountState = await client.getAccountState(account.getAddress())

    // Transfer
    const response = await client.transferCoins(account, toAddress, amountToTransfer)
    if (response.acStatus !== LibraAdmissionControlStatus.ACCEPTED) {
      console.log(JSON.stringify(response))
      throw new Error(`admission_control failed with status ${LibraAdmissionControlStatus[response.acStatus]}`)
    }

    // Ensure sender account balance was reduced accordingly
    await response.awaitConfirmation(client)
    const afterAccountState = await client.getAccountState(account.getAddress())
    if (afterAccountState.balance.toString(10) !== beforeAccountState.balance.minus(amountToTransfer).toString(10)) {
      console.log(JSON.stringify(response))
      throw new Error(`transfer failed`)
    }
    
    return {
      response: response,
      address: account.getAddress().toHex()
    }
  }

  async mint(address, amount) {
    const client = new LibraClient({ network: LibraNetwork.Testnet })

    // Mint 100 Libra coins
    const result = await client.mintWithFaucetService(address, BigNumber(amount).times(1e6).toString(10))

    return {
      result: result,
      address: address,
      amount: BigNumber(amount).toString(10)
    }
  }

  async queryTransactionHistory(address) {
    // Get transaction histories from libexplorer
    const url = `https://api-test.libexplorer.com/api?module=account&action=txlist&address=${address}`
    console.log(`callinng faucet ${url}`)
    const response = await axios.get(url)

    // Valdiate response
    if (response === undefined || response.data === undefined || response.data.status !== '1') {
      console.error(`Failed response ${response}`)
      throw new Error(`Internal server error`)
    }

    // console.log(response.data.result)

    // Transform data
    let transactions = response.data.result.map(transaction => {
      // Convert from micro libras
      const amountInBaseUnit = BigNumber(transaction.value).div(1e6)
      let output = {
        amount: amountInBaseUnit.toString(10),
        fromAddress: transaction.from,
        toAddress: transaction.to,
        date: moment.utc(parseInt(transaction.expirationTime) * 1000).format(),
        transactionVersion: parseInt(transaction.version),
        explorerLink: `https://libexplorer.com/version/${transaction.version}`
      }
      // Mint
      if (transaction.from === '0000000000000000000000000000000000000000000000000000000000000000') {
        output.event = 'mint'
        output.type = 'mint_transaction'
      // Sent
      } else if (transaction.from.toLowerCase() === address.toLowerCase()) {
        output.event = 'sent'
        output.type = 'peer_to_peer_transaction'
      // Received
      } else {
        output.event = 'received'
        output.type = 'peer_to_peer_transaction'
      }
      return output
    })

    // Sort by transaction version desc
    transactions = transactions.sort((a, b) => {
      return b.transactionVersion - a.transactionVersion
    })

    return transactions
  }

  async accountState(address) {
    const client = new LibraClient({ network: LibraNetwork.Testnet })

    const accountState = await client.getAccountState(address)

    const { sentEventsCount, receivedEventsCount } = accountState

    

    return { sentEventsCount, receivedEventsCount}
  }
}


module.exports = Libra
