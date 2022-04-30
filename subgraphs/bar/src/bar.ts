import {
  ADDRESS_ZERO,
  BIG_DECIMAL_1E18,
  BIG_DECIMAL_1E6,
  BIG_DECIMAL_ZERO,
  BIG_INT_ZERO,
  ENERGYFI_BAR_ADDRESS,
  ENERGYFI_TOKEN_ADDRESS,
  ENERGYFI_USDT_PAIR_ADDRESS,
} from 'const'
import { Address, BigDecimal, BigInt, dataSource, ethereum, log } from '@graphprotocol/graph-ts'
import { Bar, History, User } from '../generated/schema'
import { Bar as BarContract, Transfer as TransferEvent } from '../generated/EnergyFiBar/Bar'

import { Pair as PairContract } from '../generated/EnergyFiBar/Pair'
import { EnergyFiToken as EnergyFiTokenContract } from '../generated/EnergyFiBar/EnergyFiToken'

// TODO: Get averages of multiple energyFi stablecoin pairs
function getEnergyFiPrice(): BigDecimal {
  const pair = PairContract.bind(ENERGYFI_USDT_PAIR_ADDRESS)
  const reserves = pair.getReserves()
  return reserves.value1.toBigDecimal().times(BIG_DECIMAL_1E18).div(reserves.value0.toBigDecimal()).div(BIG_DECIMAL_1E6)
}

function createBar(block: ethereum.Block): Bar {
  const contract = BarContract.bind(dataSource.address())
  const bar = new Bar(dataSource.address().toHex())
  bar.decimals = contract.decimals()
  bar.name = contract.name()
  bar.energyFi = contract.energyFi()
  bar.symbol = contract.symbol()
  bar.totalSupply = BIG_DECIMAL_ZERO
  bar.energyFiStaked = BIG_DECIMAL_ZERO
  bar.energyFiStakedUSD = BIG_DECIMAL_ZERO
  bar.energyFiHarvested = BIG_DECIMAL_ZERO
  bar.energyFiHarvestedUSD = BIG_DECIMAL_ZERO
  bar.xEnergyFiMinted = BIG_DECIMAL_ZERO
  bar.xEnergyFiBurned = BIG_DECIMAL_ZERO
  bar.xEnergyFiAge = BIG_DECIMAL_ZERO
  bar.xEnergyFiAgeDestroyed = BIG_DECIMAL_ZERO
  bar.ratio = BIG_DECIMAL_ZERO
  bar.updatedAt = block.timestamp
  bar.save()

  return bar as Bar
}

function getBar(block: ethereum.Block): Bar {
  let bar = Bar.load(dataSource.address().toHex())

  if (bar === null) {
    bar = createBar(block)
  }

  return bar as Bar
}

function createUser(address: Address, block: ethereum.Block): User {
  const user = new User(address.toHex())

  // Set relation to bar
  user.bar = dataSource.address().toHex()

  user.xEnergyFi = BIG_DECIMAL_ZERO
  user.xEnergyFiMinted = BIG_DECIMAL_ZERO
  user.xEnergyFiBurned = BIG_DECIMAL_ZERO

  user.energyFiStaked = BIG_DECIMAL_ZERO
  user.energyFiStakedUSD = BIG_DECIMAL_ZERO

  user.energyFiHarvested = BIG_DECIMAL_ZERO
  user.energyFiHarvestedUSD = BIG_DECIMAL_ZERO

  // In/Out
  user.xEnergyFiOut = BIG_DECIMAL_ZERO
  user.energyFiOut = BIG_DECIMAL_ZERO
  user.usdOut = BIG_DECIMAL_ZERO

  user.xEnergyFiIn = BIG_DECIMAL_ZERO
  user.energyFiIn = BIG_DECIMAL_ZERO
  user.usdIn = BIG_DECIMAL_ZERO

  user.xEnergyFiAge = BIG_DECIMAL_ZERO
  user.xEnergyFiAgeDestroyed = BIG_DECIMAL_ZERO

  user.xEnergyFiOffset = BIG_DECIMAL_ZERO
  user.energyFiOffset = BIG_DECIMAL_ZERO
  user.usdOffset = BIG_DECIMAL_ZERO
  user.updatedAt = block.timestamp

  return user as User
}

function getUser(address: Address, block: ethereum.Block): User {
  let user = User.load(address.toHex())

  if (user === null) {
    user = createUser(address, block)
  }

  return user as User
}

function getHistory(block: ethereum.Block): History {
  const day = block.timestamp.toI32() / 86400

  const id = BigInt.fromI32(day).toString()

  let history = History.load(id)

  if (history === null) {
    const date = day * 86400
    history = new History(id)
    history.date = date
    history.timeframe = 'Day'
    history.energyFiStaked = BIG_DECIMAL_ZERO
    history.energyFiStakedUSD = BIG_DECIMAL_ZERO
    history.energyFiHarvested = BIG_DECIMAL_ZERO
    history.energyFiHarvestedUSD = BIG_DECIMAL_ZERO
    history.xEnergyFiAge = BIG_DECIMAL_ZERO
    history.xEnergyFiAgeDestroyed = BIG_DECIMAL_ZERO
    history.xEnergyFiMinted = BIG_DECIMAL_ZERO
    history.xEnergyFiBurned = BIG_DECIMAL_ZERO
    history.xEnergyFiSupply = BIG_DECIMAL_ZERO
    history.ratio = BIG_DECIMAL_ZERO
  }

  return history as History
}

export function transfer(event: TransferEvent): void {
  // Convert to BigDecimal with 18 places, 1e18.
  const value = event.params.value.divDecimal(BIG_DECIMAL_1E18)

  // If value is zero, do nothing.
  if (value.equals(BIG_DECIMAL_ZERO)) {
    log.warning('Transfer zero value! Value: {} Tx: {}', [
      event.params.value.toString(),
      event.transaction.hash.toHex(),
    ])
    return
  }

  const bar = getBar(event.block)
  const barContract = BarContract.bind(ENERGYFI_BAR_ADDRESS)

  const energyFiPrice = getEnergyFiPrice()

  bar.totalSupply = barContract.totalSupply().divDecimal(BIG_DECIMAL_1E18)
  bar.energyFiStaked = EnergyFiTokenContract.bind(ENERGYFI_TOKEN_ADDRESS)
    .balanceOf(ENERGYFI_BAR_ADDRESS)
    .divDecimal(BIG_DECIMAL_1E18)
  bar.ratio = bar.energyFiStaked.div(bar.totalSupply)

  const what = value.times(bar.ratio)

  // Minted xEnergyFi
  if (event.params.from == ADDRESS_ZERO) {
    const user = getUser(event.params.to, event.block)

    log.info('{} minted {} xEnergyFi in exchange for {} energyFi - energyFiStaked before {} energyFiStaked after {}', [
      event.params.to.toHex(),
      value.toString(),
      what.toString(),
      user.energyFiStaked.toString(),
      user.energyFiStaked.plus(what).toString(),
    ])

    if (user.xEnergyFi == BIG_DECIMAL_ZERO) {
      log.info('{} entered the bar', [user.id])
      user.bar = bar.id
    }

    user.xEnergyFiMinted = user.xEnergyFiMinted.plus(value)

    const energyFiStakedUSD = what.times(energyFiPrice)

    user.energyFiStaked = user.energyFiStaked.plus(what)
    user.energyFiStakedUSD = user.energyFiStakedUSD.plus(energyFiStakedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xEnergyFiAge = days.times(user.xEnergyFi)

    user.xEnergyFiAge = user.xEnergyFiAge.plus(xEnergyFiAge)

    // Update last
    user.xEnergyFi = user.xEnergyFi.plus(value)

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXenergyFi = bar.xEnergyFiMinted.minus(bar.xEnergyFiBurned)
    bar.xEnergyFiMinted = bar.xEnergyFiMinted.plus(value)
    bar.xEnergyFiAge = bar.xEnergyFiAge.plus(barDays.times(barXenergyFi))
    bar.energyFiStaked = bar.energyFiStaked.plus(what)
    bar.energyFiStakedUSD = bar.energyFiStakedUSD.plus(energyFiStakedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xEnergyFiAge = bar.xEnergyFiAge
    history.xEnergyFiMinted = history.xEnergyFiMinted.plus(value)
    history.xEnergyFiSupply = bar.totalSupply
    history.energyFiStaked = history.energyFiStaked.plus(what)
    history.energyFiStakedUSD = history.energyFiStakedUSD.plus(energyFiStakedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // Burned xEnergyFi
  if (event.params.to == ADDRESS_ZERO) {
    log.info('{} burned {} xEnergyFi', [event.params.from.toHex(), value.toString()])

    const user = getUser(event.params.from, event.block)

    user.xEnergyFiBurned = user.xEnergyFiBurned.plus(value)

    user.energyFiHarvested = user.energyFiHarvested.plus(what)

    const energyFiHarvestedUSD = what.times(energyFiPrice)

    user.energyFiHarvestedUSD = user.energyFiHarvestedUSD.plus(energyFiHarvestedUSD)

    const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    const xEnergyFiAge = days.times(user.xEnergyFi)

    user.xEnergyFiAge = user.xEnergyFiAge.plus(xEnergyFiAge)

    const xEnergyFiAgeDestroyed = user.xEnergyFiAge.div(user.xEnergyFi).times(value)

    user.xEnergyFiAgeDestroyed = user.xEnergyFiAgeDestroyed.plus(xEnergyFiAgeDestroyed)

    // remove xEnergyFiAge
    user.xEnergyFiAge = user.xEnergyFiAge.minus(xEnergyFiAgeDestroyed)
    // Update xEnergyFi last
    user.xEnergyFi = user.xEnergyFi.minus(value)

    if (user.xEnergyFi == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar', [user.id])
      user.bar = null
    }

    user.updatedAt = event.block.timestamp

    user.save()

    const barDays = event.block.timestamp.minus(bar.updatedAt).divDecimal(BigDecimal.fromString('86400'))
    const barXenergyFi = bar.xEnergyFiMinted.minus(bar.xEnergyFiBurned)
    bar.xEnergyFiBurned = bar.xEnergyFiBurned.plus(value)
    bar.xEnergyFiAge = bar.xEnergyFiAge.plus(barDays.times(barXenergyFi)).minus(xEnergyFiAgeDestroyed)
    bar.xEnergyFiAgeDestroyed = bar.xEnergyFiAgeDestroyed.plus(xEnergyFiAgeDestroyed)
    bar.energyFiHarvested = bar.energyFiHarvested.plus(what)
    bar.energyFiHarvestedUSD = bar.energyFiHarvestedUSD.plus(energyFiHarvestedUSD)
    bar.updatedAt = event.block.timestamp

    const history = getHistory(event.block)
    history.xEnergyFiSupply = bar.totalSupply
    history.xEnergyFiBurned = history.xEnergyFiBurned.plus(value)
    history.xEnergyFiAge = bar.xEnergyFiAge
    history.xEnergyFiAgeDestroyed = history.xEnergyFiAgeDestroyed.plus(xEnergyFiAgeDestroyed)
    history.energyFiHarvestedUSD = history.energyFiHarvestedUSD.plus(energyFiHarvestedUSD)
    history.ratio = bar.ratio
    history.save()
  }

  // If transfer from address to address and not known xEnergyFi pools.
  if (event.params.from != ADDRESS_ZERO && event.params.to != ADDRESS_ZERO) {
    log.info('transfered {} xEnergyFi from {} to {}', [
      value.toString(),
      event.params.from.toHex(),
      event.params.to.toHex(),
    ])

    const fromUser = getUser(event.params.from, event.block)

    const fromUserDays = event.block.timestamp.minus(fromUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    // Recalc xEnergyFi age first
    fromUser.xEnergyFiAge = fromUser.xEnergyFiAge.plus(fromUserDays.times(fromUser.xEnergyFi))
    // Calculate xEnergyFiAge being transfered
    const xEnergyFiAgeTranfered = fromUser.xEnergyFiAge.div(fromUser.xEnergyFi).times(value)
    // Subtract from xEnergyFiAge
    fromUser.xEnergyFiAge = fromUser.xEnergyFiAge.minus(xEnergyFiAgeTranfered)
    fromUser.updatedAt = event.block.timestamp

    fromUser.xEnergyFi = fromUser.xEnergyFi.minus(value)
    fromUser.xEnergyFiOut = fromUser.xEnergyFiOut.plus(value)
    fromUser.energyFiOut = fromUser.energyFiOut.plus(what)
    fromUser.usdOut = fromUser.usdOut.plus(what.times(energyFiPrice))

    if (fromUser.xEnergyFi == BIG_DECIMAL_ZERO) {
      log.info('{} left the bar by transfer OUT', [fromUser.id])
      fromUser.bar = null
    }

    fromUser.save()

    const toUser = getUser(event.params.to, event.block)

    if (toUser.bar === null) {
      log.info('{} entered the bar by transfer IN', [fromUser.id])
      toUser.bar = bar.id
    }

    // Recalculate xEnergyFi age and add incoming xEnergyFiAgeTransfered
    const toUserDays = event.block.timestamp.minus(toUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))

    toUser.xEnergyFiAge = toUser.xEnergyFiAge.plus(toUserDays.times(toUser.xEnergyFi)).plus(xEnergyFiAgeTranfered)
    toUser.updatedAt = event.block.timestamp

    toUser.xEnergyFi = toUser.xEnergyFi.plus(value)
    toUser.xEnergyFiIn = toUser.xEnergyFiIn.plus(value)
    toUser.energyFiIn = toUser.energyFiIn.plus(what)
    toUser.usdIn = toUser.usdIn.plus(what.times(energyFiPrice))

    const difference = toUser.xEnergyFiIn.minus(toUser.xEnergyFiOut).minus(toUser.xEnergyFiOffset)

    // If difference of energyFi in - energyFi out - offset > 0, then add on the difference
    // in staked energyFi based on xEnergyFi:energyFi ratio at time of reciept.
    if (difference.gt(BIG_DECIMAL_ZERO)) {
      const energyFi = toUser.energyFiIn.minus(toUser.energyFiOut).minus(toUser.energyFiOffset)
      const usd = toUser.usdIn.minus(toUser.usdOut).minus(toUser.usdOffset)

      log.info('{} recieved a transfer of {} xEnergyFi from {}, energyFi value of transfer is {}', [
        toUser.id,
        value.toString(),
        fromUser.id,
        what.toString(),
      ])

      toUser.energyFiStaked = toUser.energyFiStaked.plus(energyFi)
      toUser.energyFiStakedUSD = toUser.energyFiStakedUSD.plus(usd)

      toUser.xEnergyFiOffset = toUser.xEnergyFiOffset.plus(difference)
      toUser.energyFiOffset = toUser.energyFiOffset.plus(energyFi)
      toUser.usdOffset = toUser.usdOffset.plus(usd)
    }

    toUser.save()
  }

  bar.save()
}
